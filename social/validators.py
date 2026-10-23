from django.core.exceptions import ValidationError


def validate_nonempty_content(value):
    if not value or not value.strip():
        raise ValidationError("Content cannot be empty.", code="empty_content")
