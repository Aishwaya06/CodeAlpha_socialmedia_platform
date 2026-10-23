from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from django.views.generic import TemplateView
from social.interaction_views import CommentDeleteView, PostCommentsView, PostLikeView
from social.post_views import PostDetailView, PostFeedView
from social.profile_views import (
    CurrentProfileView,
    FollowView,
    PublicProfileView,
    UserDiscoveryView,
    UserFollowersView,
    UserFollowingView,
    UserPostsView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("social.auth_urls")),
    path("api/posts/", PostFeedView.as_view(), name="post-feed"),
    path("api/posts/<int:pk>/", PostDetailView.as_view(), name="post-detail"),
    path("api/posts/<int:post_pk>/comments/", PostCommentsView.as_view(), name="post-comments"),
    path("api/comments/<int:pk>/", CommentDeleteView.as_view(), name="comment-delete"),
    path("api/posts/<int:post_pk>/like/", PostLikeView.as_view(), name="post-like"),
    path("api/profiles/", UserDiscoveryView.as_view(), name="profile-discovery"),
    path("api/profiles/me/", CurrentProfileView.as_view(), name="profile-me"),
    path("api/profiles/<str:username>/follow/", FollowView.as_view(), name="profile-follow"),
    path("api/profiles/<str:username>/posts/", UserPostsView.as_view(), name="profile-posts"),
    path("api/profiles/<str:username>/followers/", UserFollowersView.as_view(), name="profile-followers"),
    path("api/profiles/<str:username>/following/", UserFollowingView.as_view(), name="profile-following"),
    path("api/profiles/<str:username>/", PublicProfileView.as_view(), name="profile-detail"),
    path("", TemplateView.as_view(template_name="index.html"), name="home"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
