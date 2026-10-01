"""Flask app factory — create_app() is the single entry point."""
import logging
import os

from flask import Flask, jsonify
from werkzeug.exceptions import HTTPException

from .config import Config
from .extensions import cors, db


def create_app(config_object: type[Config] | None = None) -> Flask:
    app = Flask(__name__)
    cfg = config_object or Config
    app.config.from_object(cfg)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    db.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
                  supports_credentials=True)

    from .blueprints.auth import bp as auth_bp
    from .blueprints.client import bp as client_bp
    from .blueprints.admin import bp as admin_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(client_bp)
    app.register_blueprint(admin_bp)

    from .services.session import AuthError
    from .services.validate import ValidationError

    @app.errorhandler(AuthError)
    def auth_error(e: AuthError):
        return jsonify(error=str(e)), e.code

    @app.errorhandler(ValidationError)
    def validation_error(e: ValidationError):
        return jsonify(error=str(e)), 400

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", service="rysyl-api")

    @app.errorhandler(HTTPException)
    def http_error(e: HTTPException):
        return jsonify(error=e.description), e.code

    @app.errorhandler(ValueError)
    def value_error(e: ValueError):
        return jsonify(error=str(e)), 400

    @app.errorhandler(Exception)
    def unexpected(e: Exception):
        app.logger.exception("unhandled error")
        return jsonify(error="Internal server error"), 500

    with app.app_context():
        # Dev/tests bootstrap the schema from models. In deployment the schema
        # is owned by Alembic (`alembic upgrade head`) — set this flag there so
        # the app never mutates the schema on boot.
        if os.environ.get("AUTO_CREATE_SCHEMA", "1") == "1":
            db.create_all()

    return app
