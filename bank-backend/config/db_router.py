class MicroserviceRouter:
    """
    A router to control database operations for different microservices.
    """
    
    route_app_labels = {
        'user_service': 'users_db',
        'account_service': 'accounts_db',
        'transfer_service': 'transfers_db',
        'bill_service': 'bills_db',
        'loan_service': 'loans_db',
        'analytics_service': 'analytics_db',
        'security_service': 'users_db',  # Security shares user database
        # Django core apps that user_service depends on
        'auth': 'users_db',
        'contenttypes': 'users_db',
        'admin': 'users_db',
        'sessions': 'users_db',
    }

    def db_for_read(self, model, **hints):
        """Route read operations to the appropriate database."""
        if model._meta.app_label in self.route_app_labels:
            return self.route_app_labels[model._meta.app_label]
        return 'default'

    def db_for_write(self, model, **hints):
        """Route write operations to the appropriate database."""
        if model._meta.app_label in self.route_app_labels:
            return self.route_app_labels[model._meta.app_label]
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        """Allow relations within the same microservice database."""
        db1 = self.route_app_labels.get(obj1._meta.app_label)
        db2 = self.route_app_labels.get(obj2._meta.app_label)
        if db1 and db2:
            return db1 == db2
        return None

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """Ensure migrations go to the correct database."""
        if app_label in self.route_app_labels:
            return db == self.route_app_labels[app_label]
        # For apps not in route_app_labels, only allow migration to default
        if db == 'default' and app_label not in self.route_app_labels:
            return True
        return False