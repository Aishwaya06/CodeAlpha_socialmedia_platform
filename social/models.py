from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q

from .validators import validate_nonempty_content

MAX_POST_LENGTH = 5000
MAX_COMMENT_LENGTH = 2000


class Profile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )
    bio = models.TextField(blank=True)
    profile_picture = models.ImageField(upload_to="profiles/", blank=True, null=True)
    location = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Profile: {self.user.get_username()}"


class Post(models.Model):
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="posts",
    )
    content = models.TextField(max_length=MAX_POST_LENGTH, validators=[validate_nonempty_content])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-pk"]
        constraints = [
            models.CheckConstraint(condition=~Q(content=""), name="social_post_content_not_empty"),
        ]

    def clean(self):
        super().clean()
        validate_nonempty_content(self.content)

    def __str__(self):
        excerpt = " ".join(self.content.split())[:50]
        return f"{self.author.get_username()}: {excerpt}"


class Comment(models.Model):
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="comments",
    )
    content = models.TextField(max_length=MAX_COMMENT_LENGTH, validators=[validate_nonempty_content])
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["created_at", "pk"]
        constraints = [
            models.CheckConstraint(condition=~Q(content=""), name="social_comment_content_not_empty"),
        ]

    def clean(self):
        super().clean()
        validate_nonempty_content(self.content)

    def __str__(self):
        excerpt = " ".join(self.content.split())[:50]
        return f"{self.author.get_username()} on post {self.post_id}: {excerpt}"


class Like(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name="likes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "post"], name="social_unique_user_post_like"),
        ]

    def __str__(self):
        return f"{self.user.get_username()} likes post {self.post_id}"


class Follow(models.Model):
    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="following_relationships",
    )
    following = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="follower_relationships",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["follower", "following"], name="social_unique_follow_pair"),
            models.CheckConstraint(
                condition=~Q(follower=F("following")),
                name="social_follow_no_self_follow",
            ),
        ]

    def clean(self):
        super().clean()
        if self.follower_id and self.follower_id == self.following_id:
            raise ValidationError({"following": "A user cannot follow themselves."})

    def __str__(self):
        return f"{self.follower.get_username()} follows {self.following.get_username()}"
