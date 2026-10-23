from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Follow


User = get_user_model()


class FollowAndDiscoveryApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.first = User.objects.create_user(
            username="first_user", email="first-private@example.com", password="Strong-passphrase-624!"
        )
        self.target = User.objects.create_user(username="target_user", password="Strong-passphrase-624!")
        self.third = User.objects.create_user(username="third_user", password="Strong-passphrase-624!")

    def follow_url(self, username=None):
        return reverse("profile-follow", kwargs={"username": username or self.target.username})

    def test_authenticated_follow_is_idempotent_and_updates_counts_and_state(self):
        self.client.force_authenticate(user=self.first)
        followed = self.client.post(self.follow_url())
        repeated = self.client.post(self.follow_url())

        self.assertEqual(followed.status_code, 200)
        self.assertTrue(followed.data["is_following"])
        self.assertEqual(followed.data["follower_count"], 1)
        self.assertEqual(Follow.objects.filter(follower=self.first, following=self.target).count(), 1)
        self.assertEqual(repeated.data["follower_count"], 1)
        self.assertTrue(repeated.data["is_following"])

        public = self.client.get(reverse("profile-detail", kwargs={"username": self.target.username}))
        self.assertEqual(public.data["follower_count"], 1)
        self.assertTrue(public.data["is_following"])

        following = self.client.get(reverse("profile-following", kwargs={"username": self.first.username}))
        followers = self.client.get(reverse("profile-followers", kwargs={"username": self.target.username}))
        self.assertEqual([p["username"] for p in following.data["results"]], ["target_user"])
        self.assertEqual([p["username"] for p in followers.data["results"]], ["first_user"])

    def test_unfollow_removes_only_the_current_users_relationship(self):
        Follow.objects.create(follower=self.first, following=self.target)
        Follow.objects.create(follower=self.third, following=self.target)
        self.client.force_authenticate(user=self.first)

        response = self.client.delete(self.follow_url())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["follower_count"], 1)
        self.assertFalse(response.data["is_following"])
        self.assertFalse(Follow.objects.filter(follower=self.first, following=self.target).exists())
        self.assertTrue(Follow.objects.filter(follower=self.third, following=self.target).exists())

        repeated = self.client.delete(self.follow_url())
        self.assertEqual(repeated.data["follower_count"], 1)

    def test_anonymous_self_and_missing_user_follow_requests_are_rejected(self):
        self.assertEqual(self.client.post(self.follow_url()).status_code, 403)
        self.client.force_authenticate(user=self.first)
        self.assertEqual(self.client.post(self.follow_url("first_user")).status_code, 400)
        self.assertEqual(Follow.objects.count(), 0)
        self.assertEqual(self.client.post(self.follow_url("missing_user")).status_code, 404)
        self.assertEqual(self.client.delete(self.follow_url("missing_user")).status_code, 404)

    def test_database_constraint_prevents_duplicate_follow_rows(self):
        Follow.objects.create(follower=self.first, following=self.target)
        with self.assertRaises(IntegrityError), transaction.atomic():
            Follow.objects.create(follower=self.first, following=self.target)

    def test_user_discovery_is_public_searchable_paginated_and_excludes_current_user(self):
        anonymous = self.client.get(reverse("profile-discovery"), {"page_size": 1})
        self.assertEqual(anonymous.status_code, 200)
        self.assertEqual(anonymous.data["count"], 3)
        self.assertEqual(len(anonymous.data["results"]), 1)
        self.assertIsNotNone(anonymous.data["next"])
        profile = anonymous.data["results"][0]
        self.assertNotIn("email", profile)
        self.assertNotIn("password", profile)

        self.client.force_authenticate(user=self.first)
        own_excluded = self.client.get(reverse("profile-discovery"))
        usernames = {profile["username"] for profile in own_excluded.data["results"]}
        self.assertEqual(own_excluded.data["count"], 2)
        self.assertNotIn("first_user", usernames)

        searched = self.client.get(reverse("profile-discovery"), {"search": "TARGET"})
        self.assertEqual(searched.data["count"], 1)
        self.assertEqual(searched.data["results"][0]["username"], "target_user")
