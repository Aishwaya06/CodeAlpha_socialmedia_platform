from rest_framework import serializers

from .models import Comment, MAX_COMMENT_LENGTH
from .post_serializers import PostAuthorSerializer


class CommentReadSerializer(serializers.ModelSerializer):
    author = PostAuthorSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ("id", "author", "content", "created_at", "updated_at")
        read_only_fields = fields


class CommentWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Comment
        fields = ("content",)

    def to_internal_value(self, data):
        unknown_fields = set(data.keys()) - set(self.fields.keys())
        if unknown_fields:
            raise serializers.ValidationError({
                field: "This field cannot be set here." for field in sorted(unknown_fields)
            })
        return super().to_internal_value(data)

    def validate_content(self, value):
        if not value.strip():
            raise serializers.ValidationError("Comment content cannot be empty.")
        if len(value) > MAX_COMMENT_LENGTH:
            raise serializers.ValidationError(
                f"Comment content cannot exceed {MAX_COMMENT_LENGTH} characters."
            )
        return value
