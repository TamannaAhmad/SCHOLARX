from django.test import TestCase
from django.apps import apps

from accounts.models import Department, Skill
from accounts import signals as account_signals


class TestPostMigrateSeeding(TestCase):
    def test_departments_seeded_after_migrate(self):
        # The test DB is created by running migrations; post_migrate should have fired
        expected = {
            'Artificial Intelligence and Data Science',
            'Civil Engineering',
            'Computer Science and Business Systems',
            'Computer Science and Engineering',
            'Electronics and Communication Engineering',
            'Mechanical Engineering',
        }
        existing = set(
            Department.objects.filter(name__in=expected).values_list('name', flat=True)
        )
        self.assertTrue(
            expected.issubset(existing),
            msg=f"Missing seeded departments: {sorted(expected - existing)}",
        )

    def test_skills_seeded_after_migrate(self):
        # Ensure at least some skills were created
        self.assertGreater(
            Skill.objects.count(),
            0,
            msg="Expected skills to be seeded after migrations",
        )

    def test_idempotent_seeding_functions(self):
        # Capture current counts
        dept_count_before = Department.objects.count()
        skill_count_before = Skill.objects.count()

        # Call seeding functions again to ensure no duplicates are created
        account_signals.add_test_departments()
        account_signals.add_test_skills()

        self.assertEqual(
            Department.objects.count(),
            dept_count_before,
            msg="Department seeding should be idempotent (no duplicates)",
        )
        self.assertEqual(
            Skill.objects.count(),
            skill_count_before,
            msg="Skill seeding should be idempotent (no duplicates)",
        )
