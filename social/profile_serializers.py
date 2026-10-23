from rest_framework import serializers

from .models import Profile


DEFAULT_AVATAR_PATH = "/static/images/default-avatar.svg"
MAX_PROFILE_PICTURE_SIZE = 5 * 1024 * 1024


class PublicProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    full_name = serializers.SerializerMethodField()
    profile_picture = serializers.SerializerMethodField()
    post_count = serializers.IntegerField(read_only=True)
    follower_count = serializers.IntegerField(read_only=True)
    following_count = serializers.IntegerField(read_only=True)
    is_following = serializers.BooleanField(read_only=True)

    class Meta:
        model = Profile
        fields = (
            "username",
            "full_name",
            "bio",
            "profile_picture",
            "location",
            "post_count",
            "follower_count",
            "following_count",
            "is_following",
        )
        read_only_fields = fields

    def get_full_name(self, profile):
        return profile.user.get_full_name()

    def get_profile_picture(self, profile):
        request = self.context.get("request")
        if profile.profile_picture:
            url = profile.profile_picture.url
        else:
            url = DEFAULT_AVATAR_PATH
        return request.build_absolute_uri(url) if request else url


class ProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ("bio", "profile_picture", "location")

    def to_internal_value(self, data):
        unknown_fields = set(data.keys()) - set(self.fields.keys())
        if unknown_fields:
            raise serializers.ValidationError({
                field: "This field cannot be updated here." for field in sorted(unknown_fields)
            })
        return super().to_internal_value(data)

    def validate_profile_picture(self, image):
        if image.size > MAX_PROFILE_PICTURE_SIZE:
            raise serializers.ValidationError("Profile pictures must be 5 MB or smaller.")
        return image
