from django.contrib import admin

from .models import Comment, Follow, Like, Post, Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "location", "created_at", "updated_at")
    search_fields = ("user__username", "user__email", "location", "bio")


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("author", "content_preview", "created_at", "updated_at")
    list_filter = ("created_at", "updated_at")
    search_fields = ("author__username", "content")

    @admin.display(description="Content")
    def content_preview(self, obj):
        return obj.content[:80]


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("author", "post", "content_preview", "created_at")
    list_filter = ("created_at",)
    search_fields = ("author__username", "post__content", "content")

    @admin.display(description="Content")
    def content_preview(self, obj):
        return obj.content[:80]


@admin.register(Like)
class LikeAdmin(admin.ModelAdmin):
    list_display = ("user", "post", "created_at")
    list_filter = ("created_at",)
    search_fields = ("user__username", "post__content")


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "following", "created_at")
    list_filter = ("created_at",)
    search_fields = ("follower__username", "following__username")
