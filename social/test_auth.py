from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase


User = get_user_model()
STRONG_PASSWORD = "A-strong-passphrase-934!"


class AuthenticationApiTests(APITestCase):
    def setUp(self):
        self.client = APIClient(enforce_csrf_checks=True)
        self.register_url = reverse("register")
        self.login_url = reverse("login")
        self.logout_url = reverse("logout")
        self.me_url = reverse("current-user")
        self.csrf_url = reverse("csrf-token")

    def csrf_headers(self):
        response = self.client.get(self.csrf_url)
        self.assertEqual(response.status_code, 200)
        token = response.data["csrfToken"]
        self.assertIn("csrftoken", self.client.cookies)
        return {"HTTP_X_CSRFTOKEN": token}

    def registration_data(self, **overrides):
        data = {
            "username": "connectly_user",
            "email": "connectly@example.com",
            "password": STRONG_PASSWORD,
            "password_confirmation": STRONG_PASSWORD,
        }
        data.update(overrides)
        return data

    def test_csrf_token_endpoint_provides_cookie_and_token(self):
        response = self.client.get(self.csrf_url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["csrfToken"])
        self.assertIn("csrftoken", self.client.cookies)

    def test_registration_creates_user_with_hashed_password(self):
        response = self.client.post(
            self.register_url,
            self.registration_data(),
            format="json",
            **self.csrf_headers(),
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="connectly_user")
        self.assertTrue(user.check_password(STRONG_PASSWORD))
        self.assertNotEqual(user.password, STRONG_PASSWORD)
        self.assertNotIn("password", response.data)
        self.assertNotIn("password_confirmation", response.data)

    def test_registration_rejects_duplicate_username_and_missing_fields(self):
        User.objects.create_user(username="connectly_user", password=STRONG_PASSWORD)
        headers = self.csrf_headers()
        duplicate = self.client.post(
            self.register_url,
            self.registration_data(),
            format="json",
            **headers,
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn("username", duplicate.data)

        missing = self.client.post(
            self.register_url,
            {"username": "another_user"},
            format="json",
            **headers,
        )
        self.assertEqual(missing.status_code, 400)
        self.assertIn("email", missing.data)
        self.assertIn("password", missing.data)

    def test_registration_rejects_password_confirmation_mismatch(self):
        response = self.client.post(
            self.register_url,
            self.registration_data(password_confirmation="Different-passphrase-44!"),
            format="json",
            **self.csrf_headers(),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password_confirmation", response.data)
        self.assertFalse(User.objects.filter(username="connectly_user").exists())

    def test_registration_requires_csrf_token(self):
        response = self.client.post(self.register_url, self.registration_data(), format="json")
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(username="connectly_user").exists())

    def test_login_establishes_session_and_current_user_endpoint(self):
        User.objects.create_user(username="connectly_user", password=STRONG_PASSWORD)
        response = self.client.post(
            self.login_url,
            {"username": "connectly_user", "password": STRONG_PASSWORD},
            format="json",
            **self.csrf_headers(),
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("sessionid", self.client.cookies)
        self.assertNotIn("password", response.data["user"])

        me = self.client.get(self.me_url)
        self.assertEqual(me.status_code, 200)
        self.assertTrue(me.data["is_authenticated"])
        self.assertEqual(me.data["user"]["username"], "connectly_user")

    def test_login_rejects_invalid_credentials(self):
        User.objects.create_user(username="connectly_user", password=STRONG_PASSWORD)
        response = self.client.post(
            self.login_url,
            {"username": "connectly_user", "password": "incorrect-password"},
            format="json",
            **self.csrf_headers(),
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("detail", response.data)
        self.assertNotIn("sessionid", self.client.cookies)

    def test_protected_current_user_rejects_anonymous_request(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, 403)

    def test_logout_invalidates_session_and_protected_access(self):
        User.objects.create_user(username="connectly_user", password=STRONG_PASSWORD)
        self.client.post(
            self.login_url,
            {"username": "connectly_user", "password": STRONG_PASSWORD},
            format="json",
            **self.csrf_headers(),
        )
        self.assertEqual(self.client.get(self.me_url).status_code, 200)

        response = self.client.post(self.logout_url, {}, format="json", **self.csrf_headers())
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get(self.me_url).status_code, 403)

    def test_logout_requires_csrf_token(self):
        response = self.client.post(self.logout_url, {}, format="json")
        self.assertEqual(response.status_code, 403)
