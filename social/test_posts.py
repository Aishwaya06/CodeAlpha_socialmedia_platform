from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Comment, Like, MAX_POST_LENGTH, Post


User = get_user_model()


class PostApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(username="post_author", password="Strong-passphrase-624!")
        self.other = User.objects.create_user(username="other_user", password="Strong-passphrase-624!")
        self.feed_url = reverse("post-feed")

    def detail_url(self, post):
        return reverse("post-detail", kwargs={"pk": post.pk})

    def test_authenticated_user_can_create_post_as_self(self):
        self.client.force_authenticate(user=self.author)
        response = self.client.post(self.feed_url, {"content": "Hello Connectly"}, format="json")

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["author"]["username"], "post_author")
        self.assertEqual(response.data["content"], "Hello Connectly")
        self.assertEqual(response.data["like_count"], 0)
        self.assertEqual(response.data["comment_count"], 0)
        self.assertFalse(response.data["is_liked"])
        self.assertEqual(Post.objects.get().author, self.author)

    def test_anonymous_user_cannot_create_post(self):
        response = self.client.post(self.feed_url, {"content": "Anonymous"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(Post.objects.count(), 0)

    def test_author_impersonation_and_invalid_content_are_rejected(self):
        self.client.force_authenticate(user=self.author)
        spoofed = self.client.post(
            self.feed_url,
            {"content": "Not impersonating", "author": self.other.pk},
            format="json",
        )
        self.assertEqual(spoofed.status_code, 400)
        self.assertIn("author", spoofed.data)

        for content in ("", "   ", "x" * (MAX_POST_LENGTH + 1)):
            with self.subTest(content_length=len(content)):
                response = self.client.post(self.feed_url, {"content": content}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn("content", response.data)
        self.assertEqual(Post.objects.count(), 0)

    def test_feed_is_paginated_latest_first_with_engagement_state(self):
        posts = [Post.objects.create(author=self.author, content=f"Post {index}") for index in range(5)]
        Like.objects.create(user=self.other, post=posts[-1])
        Comment.objects.create(post=posts[-1], author=self.other, content="A comment")

        first_page = self.client.get(self.feed_url, {"page_size": 2})
        self.assertEqual(first_page.status_code, 200)
        self.assertEqual(first_page.data["count"], 5)
        self.assertIsNotNone(first_page.data["next"])
        self.assertEqual([item["id"] for item in first_page.data["results"]], [posts[-1].pk, posts[-2].pk])
        latest = first_page.data["results"][0]
        self.assertEqual(latest["like_count"], 1)
        self.assertEqual(latest["comment_count"], 1)
        self.assertFalse(latest["is_liked"])
        self.assertEqual(latest["author"]["username"], "post_author")
        self.assertTrue(latest["author"]["profile_picture"].endswith("/static/images/default-avatar.svg"))

        self.client.force_authenticate(user=self.other)
        liked_feed = self.client.get(self.feed_url)
        liked_entry = next(item for item in liked_feed.data["results"] if item["id"] == posts[-1].pk)
        self.assertTrue(liked_entry["is_liked"])

    def test_single_post_read_edit_delete_and_owner_permissions(self):
        post = Post.objects.create(author=self.author, content="Original")
        detail = self.detail_url(post)
        self.assertEqual(self.client.get(detail).status_code, 200)

        self.client.force_authenticate(user=self.other)
        denied_edit = self.client.patch(detail, {"content": "Changed"}, format="json")
        denied_delete = self.client.delete(detail)
        self.assertEqual(denied_edit.status_code, 403)
        self.assertEqual(denied_delete.status_code, 403)
        post.refresh_from_db()
        self.assertEqual(post.content, "Original")

        self.client.force_authenticate(user=self.author)
        edited = self.client.patch(detail, {"content": "Updated"}, format="json")
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data["content"], "Updated")
        self.assertEqual(edited.data["author"]["username"], "post_author")

        deleted = self.client.delete(detail)
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Post.objects.filter(pk=post.pk).exists())
        self.assertEqual(self.client.get(detail).status_code, 404)

    def test_deleting_post_cascades_to_likes_and_comments(self):
        post = Post.objects.create(author=self.author, content="With relationships")
        Like.objects.create(user=self.other, post=post)
        Comment.objects.create(post=post, author=self.other, content="A comment")
        self.client.force_authenticate(user=self.author)

        response = self.client.delete(self.detail_url(post))
        self.assertEqual(response.status_code, 204)
        self.assertEqual(Like.objects.count(), 0)
        self.assertEqual(Comment.objects.count(), 0)
