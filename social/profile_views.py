from django.contrib.auth import get_user_model
from django.db.models import BooleanField, Count, Exists, OuterRef, Value
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Follow, Post, Profile
from .post_serializers import PostReadSerializer
from .post_views import annotated_posts
from .profile_serializers import ProfileUpdateSerializer, PublicProfileSerializer


User = get_user_model()


def profiles_with_counts(viewer=None):
    queryset = Profile.objects.select_related("user").annotate(
        post_count=Count("user__posts", distinct=True),
        follower_count=Count("user__follower_relationships", distinct=True),
        following_count=Count("user__following_relationships", distinct=True),
    )
    if viewer and viewer.is_authenticated:
        follows = Follow.objects.filter(follower=viewer, following_id=OuterRef("user_id"))
        return queryset.annotate(is_following=Exists(follows))
    return queryset.annotate(is_following=Value(False, output_field=BooleanField()))


class ProfilePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class PublicProfileView(generics.RetrieveAPIView):
    serializer_class = PublicProfileSerializer
    permission_classes = [AllowAny]

    def get_object(self):
        return get_object_or_404(profiles_with_counts(self.request.user), user__username=self.kwargs["username"])


class CurrentProfileView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return get_object_or_404(profiles_with_counts(self.request.user), user=self.request.user)

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return ProfileUpdateSerializer
        return PublicProfileSerializer

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def patch(self, request, *args, **kwargs):
        response = super().patch(request, *args, **kwargs)
        if response.status_code < 400:
            profile = self.get_object()
            response.data = PublicProfileSerializer(profile, context=self.get_serializer_context()).data
        return response


class UserPostsView(generics.ListAPIView):
    serializer_class = PostReadSerializer
    permission_classes = [AllowAny]
    pagination_class = ProfilePagination

    def get_queryset(self):
        username = self.kwargs["username"]
        get_object_or_404(User, username=username)
        return annotated_posts(
            Post.objects.filter(author__username=username),
            self.request.user,
        )


class UserRelationshipListView(generics.ListAPIView):
    serializer_class = PublicProfileSerializer
    permission_classes = [AllowAny]
    pagination_class = ProfilePagination
    relationship_filter = None

    def get_queryset(self):
        user = get_object_or_404(User.objects.only("pk"), username=self.kwargs["username"])
        return profiles_with_counts(self.request.user).filter(**{self.relationship_filter: user}).order_by("user__username")


class UserFollowersView(UserRelationshipListView):
    relationship_filter = "user__following_relationships__following"


class UserFollowingView(UserRelationshipListView):
    relationship_filter = "user__follower_relationships__follower"


class UserDiscoveryView(generics.ListAPIView):
    serializer_class = PublicProfileSerializer
    permission_classes = [AllowAny]
    pagination_class = ProfilePagination

    def get_queryset(self):
        queryset = profiles_with_counts(self.request.user).order_by("user__username")
        if self.request.user.is_authenticated:
            queryset = queryset.exclude(user=self.request.user)
        search = self.request.query_params.get("search", "").strip()
        if search:
            queryset = queryset.filter(user__username__icontains=search)
        return queryset


class FollowView(APIView):
    permission_classes = [IsAuthenticated]

    def get_target(self, username):
        return get_object_or_404(User.objects.only("pk"), username=username)

    def profile_response(self, target):
        profile = get_object_or_404(profiles_with_counts(self.request.user), user=target)
        return Response(PublicProfileSerializer(profile, context={"request": self.request}).data)

    def post(self, request, username):
        target = self.get_target(username)
        if target.pk == request.user.pk:
            return Response({"detail": "You cannot follow yourself."}, status=400)
        Follow.objects.get_or_create(follower=request.user, following=target)
        return self.profile_response(target)

    def delete(self, request, username):
        target = self.get_target(username)
        if target.pk == request.user.pk:
            return Response({"detail": "You cannot follow yourself."}, status=400)
        Follow.objects.filter(follower=request.user, following=target).delete()
        return self.profile_response(target)

