from django.db.models import BooleanField, Count, Exists, OuterRef, Value
from rest_framework import generics, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response

from .models import Like, Post
from .post_permissions import IsOwnerOrReadOnly
from .post_serializers import PostReadSerializer, PostWriteSerializer


class FeedPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


def annotated_posts(queryset, user):
    if user and user.is_authenticated:
        user_likes = Like.objects.filter(post_id=OuterRef("pk"), user=user)
        queryset = queryset.annotate(user_liked=Exists(user_likes))
    else:
        queryset = queryset.annotate(user_liked=Value(False, output_field=BooleanField()))
    return queryset.select_related("author", "author__profile").annotate(
        like_count=Count("likes", distinct=True),
        comment_count=Count("comments", distinct=True),
    ).order_by("-created_at", "-pk")


class PostFeedView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticatedOrReadOnly]
    pagination_class = FeedPagination

    def get_queryset(self):
        return annotated_posts(Post.objects.all(), self.request.user)

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PostWriteSerializer
        return PostReadSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save(author=request.user)
        post = self.get_queryset().get(pk=post.pk)
        output = PostReadSerializer(post, context=self.get_serializer_context())
        return Response(output.data, status=status.HTTP_201_CREATED)


class PostDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticatedOrReadOnly, IsOwnerOrReadOnly]
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return annotated_posts(Post.objects.all(), self.request.user)

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return PostWriteSerializer
        return PostReadSerializer

    def patch(self, request, *args, **kwargs):
        response = super().patch(request, *args, **kwargs)
        if response.status_code < 400:
            post = self.get_object()
            response.data = PostReadSerializer(post, context=self.get_serializer_context()).data
        return response
