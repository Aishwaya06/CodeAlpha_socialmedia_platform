from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .interaction_permissions import IsCommentAuthor
from .interaction_serializers import CommentReadSerializer, CommentWriteSerializer
from .models import Comment, Like, Post
from .post_views import FeedPagination


class PostCommentsView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]
    pagination_class = FeedPagination

    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return super().get_permissions()

    def get_post(self):
        if not hasattr(self, "_post"):
            self._post = get_object_or_404(Post, pk=self.kwargs["post_pk"])
        return self._post

    def get_queryset(self):
        return Comment.objects.filter(post=self.get_post()).select_related("author", "author__profile")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return CommentWriteSerializer
        return CommentReadSerializer

    def create(self, request, *args, **kwargs):
        post = self.get_post()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.save(post=post, author=request.user)
        output = CommentReadSerializer(
            comment,
            context=self.get_serializer_context(),
        )
        return Response(
            {**output.data, "comment_count": post.comments.count()},
            status=status.HTTP_201_CREATED,
        )


class CommentDeleteView(generics.DestroyAPIView):
    queryset = Comment.objects.select_related("post")
    permission_classes = [IsAuthenticated, IsCommentAuthor]

    def destroy(self, request, *args, **kwargs):
        comment = self.get_object()
        post_id = comment.post_id
        self.perform_destroy(comment)
        return Response({
            "detail": "Comment deleted.",
            "comment_count": Comment.objects.filter(post_id=post_id).count(),
        })


class PostLikeView(APIView):
    def get_permissions(self):
        if self.request.method == "GET":
            return [AllowAny()]
        return [IsAuthenticated()]

    def get_post(self):
        return get_object_or_404(Post, pk=self.kwargs["post_pk"])

    def response_data(self, post, user):
        is_liked = bool(user and user.is_authenticated and Like.objects.filter(post=post, user=user).exists())
        return {"like_count": Like.objects.filter(post=post).count(), "is_liked": is_liked}

    def get(self, request, post_pk):
        post = self.get_post()
        return Response(self.response_data(post, request.user))

    def post(self, request, post_pk):
        post = self.get_post()
        with transaction.atomic():
            Like.objects.get_or_create(post=post, user=request.user)
        return Response(self.response_data(post, request.user), status=status.HTTP_200_OK)

    def delete(self, request, post_pk):
        post = self.get_post()
        Like.objects.filter(post=post, user=request.user).delete()
        return Response(self.response_data(post, request.user), status=status.HTTP_200_OK)
