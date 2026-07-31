"""Guard de configuración de producción (config.production_config_errors)."""

from __future__ import annotations

from app.config import Settings


def test_dev_defaults_flagged_in_production():
    s = Settings(
        environment="production",
        session_encryption_key="",
        cookie_secure=False,
        cors_origins=["http://localhost:3000"],
    )
    errors = s.production_config_errors()
    assert s.is_production is True
    assert any("SESSION_ENCRYPTION_KEY" in e for e in errors)
    assert any("COOKIE_SECURE" in e for e in errors)
    assert any("CORS_ORIGINS" in e for e in errors)


def test_secure_production_config_has_no_errors():
    s = Settings(
        environment="production",
        session_encryption_key="x" * 44,
        cookie_secure=True,
        cors_origins=["https://music4all.example"],
    )
    assert s.production_config_errors() == []


def test_development_is_not_production():
    s = Settings(environment="development")
    assert s.is_production is False
    # En desarrollo el guard no se aplica, aunque la config tenga defaults inseguros.
    assert isinstance(s.production_config_errors(), list)


def test_tracing_defaults_on_in_development_and_off_in_production():
    assert Settings(environment="development").tracing_enabled is True
    assert Settings(environment="production").tracing_enabled is False


def test_tracing_can_be_forced_either_way():
    assert Settings(environment="production", otel_tracing_enabled=True).tracing_enabled is True
    assert Settings(environment="development", otel_tracing_enabled=False).tracing_enabled is False
