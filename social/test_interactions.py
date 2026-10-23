from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Comment, Like, MAX_COMMENT_LENGTH, Post


User = get_user_model()


class CommentAndLikeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(username="owner", password="Strong-passphrase-624!")
        self.other = User.objects.create_user(username="visitor", password="Strong-passphrase-624!")
        self.post = Post.objects.create(author=self.author, content="Post for interactions")

    def comments_url(self, post=None):
        return reverse("post-comments", kwargs={"post_pk": (post or self.post).pk})

    def like_url(self, post=None):
        return reverse("post-like", kwargs={"post_pk": (post or self.post).pk})

    def test_authenticated_user_can_create_and_list_comments(self):
        self.client.force_authenticate(user=self.other)
        created = self.client.post(self.comments_url(), {"content": "A useful reply"}, format="json")

        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data["content"], "A useful reply")
        self.assertEqual(created.data["author"]["username"], "visitor")
        self.assertTrue(created.data["created_at"])
        self.assertEqual(created.data["comment_count"], 1)
        self.assertEqual(Comment.objects.get().author, self.other)

        listed = self.client.get(self.comments_url())
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(listed.data["count"], 1)
        self.assertEqual(listed.data["results"][0]["content"], "A useful reply")

    def test_anonymous_comment_creation_and_empty_comments_are_rejected(self):
        anonymous = self.client.post(self.comments_url(), {"content": "No"}, format="json")
        self.assertEqual(anonymous.status_code, 403)

        self.client.force_authenticate(user=self.other)
        for content in ("", "   ", "c" * (MAX_COMMENT_LENGTH + 1)):
            with self.subTest(content_length=len(content)):
                response = self.client.post(self.comments_url(), {"content": content}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("content", response.data)
        self.assertEqual(Comment.objects.count(), 0)

    def test_comment_deletion_is_limited_to_comment_author_and_updates_count(self):
        comment = Comment.objects.create(post=self.post, author=self.other, content="Remove me")
        self.client.force_authenticate(user=self.author)
        forbidden = self.client.delete(reverse("comment-delete", kwargs={"pk": comment.pk}))
        self.assertEqual(forbidden.status_code, 403)
        self.assertTrue(Comment.objects.filter(pk=comment.pk).exists())

        self.client.force_authenticate(user=self.other)
        deleted = self.client.delete(reverse("comment-delete", kwargs={"pk": comment.pk}))
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(deleted.data["comment_count"], 0)
        self.assertFalse(Comment.objects.filter(pk=comment.pk).exists())

    def test_comment_endpoints_return_not_found_for_missing_records(self):
        missing_posts_url = reverse("post-comments", kwargs={"post_pk": self.post.pk + 1000})
        self.assertEqual(self.client.get(missing_posts_url).status_code, 404)
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.post(missing_posts_url, {"content": "No post"}, format="json").status_code, 404)
        self.assertEqual(self.client.delete(reverse("comment-delete", kwargs={"pk": 99999})).status_code, 404)

    def test_likes_are_idempotent_and_counts_and_user_state_stay_accurate(self):
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.get(self.like_url()).data, {"like_count": 0, "is_liked": False})

        first_like = self.client.post(self.like_url())
        second_like = self.client.post(self.like_url())
        self.assertEqual(first_like.status_code, 200)
        self.assertEqual(first_like.data, {"like_count": 1, "is_liked": True})
        self.assertEqual(second_like.data, {"like_count": 1, "is_liked": True})
        self.assertEqual(Like.objects.filter(post=self.post, user=self.other).count(), 1)

        self.client.force_authenticate(user=self.author)
        self.assertEqual(self.client.get(self.like_url()).data, {"like_count": 1, "is_liked": False})
        self.client.force_authenticate(user=self.other)
        unliked = self.client.delete(self.like_url())
        repeated_unlike = self.client.delete(self.like_url())
        self.assertEqual(unliked.data, {"like_count": 0, "is_liked": False})
        self.assertEqual(repeated_unlike.data, {"like_count": 0, "is_liked": False})

    def test_anonymous_user_cannot_change_like_and_missing_post_is_not_found(self):
        self.assertEqual(self.client.post(self.like_url()).status_code, 403)
        self.assertEqual(self.client.delete(self.like_url()).status_code, 403)
        self.assertEqual(self.client.get(reverse("post-like", kwargs={"post_pk": 99999})).status_code, 404)

    def test_database_constraint_prevents_duplicate_likes(self):
        Like.objects.create(user=self.other, post=self.post)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Like.objects.create(user=self.other, post=self.post)
