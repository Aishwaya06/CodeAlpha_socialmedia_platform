from io import BytesIO
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from PIL import Image
from rest_framework.test import APIClient

from .models import Follow, Post, Profile


User = get_user_model()


class ProfileApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            username="owner",
            email="private@example.com",
            first_name="Ada",
            last_name="Lovelace",
            password="Strong-passphrase-624!",
        )
        self.follower_one = User.objects.create_user(username="follower_one", password="Strong-passphrase-624!")
        self.follower_two = User.objects.create_user(username="follower_two", password="Strong-passphrase-624!")
        self.following_user = User.objects.create_user(username="following_user", password="Strong-passphrase-624!")
        self.post_one = Post.objects.create(author=self.owner, content="First post")
        self.post_two = Post.objects.create(author=self.owner, content="Second post")
        Follow.objects.create(follower=self.follower_one, following=self.owner)
        Follow.objects.create(follower=self.follower_two, following=self.owner)
        Follow.objects.create(follower=self.owner, following=self.following_user)

    def profile_url(self, username=None):
        return reverse("profile-detail", kwargs={"username": username or self.owner.username})

    def test_public_profile_has_public_fields_default_avatar_and_correct_counts(self):
        response = self.client.get(self.profile_url())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "owner")
        self.assertEqual(response.data["full_name"], "Ada Lovelace")
        self.assertTrue(response.data["profile_picture"].endswith("/static/images/default-avatar.svg"))
        self.assertEqual(response.data["post_count"], 2)
        self.assertEqual(response.data["follower_count"], 2)
        self.assertEqual(response.data["following_count"], 1)
        self.assertNotIn("email", response.data)
        self.assertNotIn("password", response.data)

    def test_current_profile_is_protected_and_owner_can_edit_profile_fields(self):
        anonymous = self.client.get(reverse("profile-me"))
        self.assertEqual(anonymous.status_code, 403)

        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            reverse("profile-me"),
            {"bio": "Building useful things.", "location": "London"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bio"], "Building useful things.")
        self.assertEqual(response.data["location"], "London")
        self.assertEqual(Profile.objects.get(user=self.owner).bio, "Building useful things.")

    def test_profile_updates_reject_account_fields_and_non_owner_routes(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.patch(
            reverse("profile-me"),
            {"username": "changed", "email": "changed@example.com", "bio": "Allowed field"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.data)
        self.assertEqual(User.objects.get(pk=self.owner.pk).username, "owner")
        self.assertEqual(self.owner.email, "private@example.com")

        public_profile_patch = self.client.patch(self.profile_url(), {"bio": "No"}, format="json")
        self.assertEqual(public_profile_patch.status_code, 405)

    def test_missing_profile_returns_not_found(self):
        self.assertEqual(self.client.get(self.profile_url("missing-user")).status_code, 404)
        Profile.objects.filter(user=self.owner).delete()
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(self.client.get(reverse("profile-me")).status_code, 404)
        self.assertEqual(self.client.get(self.profile_url()).status_code, 404)

    def test_user_posts_followers_and_following_lists(self):
        posts = self.client.get(reverse("profile-posts", kwargs={"username": "owner"}))
        self.assertEqual(posts.status_code, 200)
        self.assertEqual(posts.data["count"], 2)
        self.assertEqual({post["content"] for post in posts.data["results"]}, {"First post", "Second post"})

        followers = self.client.get(reverse("profile-followers", kwargs={"username": "owner"}))
        self.assertEqual(followers.status_code, 200)
        self.assertEqual({profile["username"] for profile in followers.data["results"]}, {"follower_one", "follower_two"})

        following = self.client.get(reverse("profile-following", kwargs={"username": "owner"}))
        self.assertEqual(following.status_code, 200)
        self.assertEqual([profile["username"] for profile in following.data["results"]], ["following_user"])

    def test_profile_image_upload_validates_image_and_serves_uploaded_file(self):
        self.client.force_authenticate(user=self.owner)
        temp_media = TemporaryDirectory()
        self.addCleanup(temp_media.cleanup)
        image_buffer = BytesIO()
        Image.new("RGB", (2, 2), "purple").save(image_buffer, format="PNG")
        upload = SimpleUploadedFile("avatar.png", image_buffer.getvalue(), content_type="image/png")

        with override_settings(MEDIA_ROOT=temp_media.name):
            response = self.client.patch(reverse("profile-me"), {"profile_picture": upload}, format="multipart")
            self.assertEqual(response.status_code, 200)
            self.assertIn("/media/profiles/", response.data["profile_picture"])

            invalid = SimpleUploadedFile("avatar.png", b"not an image", content_type="image/png")
            rejected = self.client.patch(reverse("profile-me"), {"profile_picture": invalid}, format="multipart")
            self.assertEqual(rejected.status_code, 400)
