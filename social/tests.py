from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from .models import Comment, Follow, Like, Post, Profile


User = get_user_model()


class SocialModelTests(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(username="author", password="safe-test-password")
        self.other = User.objects.create_user(username="other", password="safe-test-password")
        self.post = Post.objects.create(author=self.author, content="A first post")

    def test_profiles_are_created_automatically_and_relationships_work(self):
        self.assertTrue(Profile.objects.filter(user=self.author).exists())
        self.assertEqual(self.author.profile.user, self.author)

        comment = Comment.objects.create(post=self.post, author=self.other, content="A reply")
        like = Like.objects.create(post=self.post, user=self.other)
        follow = Follow.objects.create(follower=self.other, following=self.author)
        self.assertEqual(self.post.comments.get(), comment)
        self.assertEqual(self.post.likes.get(), like)
        self.assertEqual(self.other.following_relationships.get(), follow)
        self.assertEqual(self.author.follower_relationships.get(), follow)

    def test_duplicate_likes_and_follows_are_rejected_by_database(self):
        Like.objects.create(user=self.other, post=self.post)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Like.objects.create(user=self.other, post=self.post)

        Follow.objects.create(follower=self.other, following=self.author)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Follow.objects.create(follower=self.other, following=self.author)

    def test_self_follow_is_rejected_by_validation_and_database(self):
        follow = Follow(follower=self.author, following=self.author)
        with self.assertRaises(ValidationError):
            follow.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Follow.objects.create(follower=self.author, following=self.author)

    def test_empty_post_and_comment_content_are_rejected(self):
        for content in ("", "   "):
            with self.subTest(model="post", content=content):
                post = Post(author=self.author, content=content)
                with self.assertRaises(ValidationError):
                    post.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Post.objects.create(author=self.author, content="")

        for content in ("", "   "):
            with self.subTest(model="comment", content=content):
                comment = Comment(post=self.post, author=self.other, content=content)
                with self.assertRaises(ValidationError):
                    comment.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Comment.objects.create(post=self.post, author=self.other, content="")

    def test_deletions_cascade_to_dependent_records(self):
        Comment.objects.create(post=self.post, author=self.other, content="A reply")
        Like.objects.create(post=self.post, user=self.other)
        Follow.objects.create(follower=self.other, following=self.author)

        self.post.delete()
        self.assertEqual(Comment.objects.count(), 0)
        self.assertEqual(Like.objects.count(), 0)

        self.author.delete()
        self.assertFalse(Profile.objects.filter(user_id=self.author.pk).exists())
        self.assertEqual(Follow.objects.count(), 0)
