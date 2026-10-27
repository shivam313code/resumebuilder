"""Compatibility import for deployments that use ``application:app``."""

from app import create_app

app = create_app()

__all__ = ["app"]
