from rest_framework import serializers

from .models import MAX_POST_LENGTH, Post
from .profile_serializers import DEFAULT_AVATAR_PATH


class PostAuthorSerializer(serializers.Serializer):
    username = serializers.CharField(read_only=True)
    full_name = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()

    def get_full_name(self, user):
        return user.get_full_name()

    def get_profile_picture(self, user):
        profile = getattr(user, "profile", None)
        url = profile.profile_picture.url if profile and profile.profile_picture else DEFAULT_AVATAR_PATH
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class PostReadSerializer(serializers.ModelSerializer):
    author = PostAuthorSerializer(read_only=True)
    like_count = serializers.IntegerField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True)
    is_liked = serializers.BooleanField(source="user_liked", read_only=True)

    class Meta:
        model = Post
        fields = (
            "id",
            "author",
            "content",
            "created_at",
            "updated_at",
            "like_count",
            "comment_count",
            "is_liked",
        )
        read_only_fields = fields


class PostWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = ("content",)

    def to_internal_value(self, data):
        unknown_fields = set(data.keys()) - set(self.fields.keys())
        if unknown_fields:
            raise serializers.ValidationError({
                field: "This field cannot be set or updated here." for field in sorted(unknown_fields)
            })
        return super().to_internal_value(data)

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("Post content cannot be empty.")
        if len(value) > MAX_POST_LENGTH:
            raise serializers.ValidationError(f"Post content cannot exceed {MAX_POST_LENGTH} characters.")
        return value
