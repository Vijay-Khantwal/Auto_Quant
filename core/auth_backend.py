"""
Custom Authentication Backend for AutoQuant.
Allows users to log in with either their username OR registered email address,
case-insensitively, and handles leading/trailing whitespace gracefully.
"""
from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.db.models import Q


class EmailOrUsernameModelBackend(ModelBackend):
    """
    Authenticate against settings.AUTH_USER_MODEL using either
    case-insensitive username or case-insensitive email address.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        if not username or not password:
            return None

        clean_identifier = username.strip()
        UserModel = get_user_model()

        # Match either username (case-insensitive) or email (case-insensitive)
        user = UserModel.objects.filter(
            Q(username__iexact=clean_identifier) | Q(email__iexact=clean_identifier)
        ).first()

        if user and user.check_password(password) and self.user_can_authenticate(user):
            return user

        return None
