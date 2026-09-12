import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('checkout', Path(__file__).resolve().parents[1] / 'api' / 'checkout.py')
checkout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checkout)


class CheckoutWebhookTests(unittest.TestCase):
    def deliver(self, event_type, obj, failure=False):
        request = object.__new__(checkout.handler)
        request.headers = {'stripe-signature': 'test'}
        request._read_body = lambda: json.dumps({'type': event_type, 'data': {'object': obj}}).encode()
        request._valid_stripe_signature = lambda *_: True
        request._upsert_subscription = Mock(side_effect=RuntimeError('database unavailable') if failure else None)
        request._json = Mock()
        with patch.dict(checkout.os.environ, {'STRIPE_WEBHOOK_SECRET': 'test-secret'}):
            request._handle_webhook()
        return request

    def test_invoice_reads_subscription_metadata_in_both_api_formats(self):
        details = {'metadata': {'user_id': 'user-one', 'plan': 'pro'}}
        for obj in [{'parent': {'subscription_details': details}}, {'subscription_details': details}]:
            request = self.deliver('invoice.payment_succeeded', obj)
            request._upsert_subscription.assert_called_once_with('user-one', 'pro', 'active')
            self.assertEqual(request._json.call_args.args[0], 200)

    def test_failed_invoice_updates_status_for_the_correct_account(self):
        request = self.deliver('invoice.payment_failed', {'parent': {'subscription_details': {'metadata': {'user_id': 'user-one', 'plan': 'premium'}}}})
        request._upsert_subscription.assert_called_once_with('user-one', 'premium', 'past_due')

    def test_database_outage_is_not_acknowledged_as_success(self):
        request = self.deliver('invoice.paid', {'metadata': {'user_id': 'user-one', 'plan': 'pro'}}, failure=True)
        self.assertEqual(request._json.call_args.args[0], 503)

    def test_unpaid_checkout_does_not_activate_a_plan(self):
        request = self.deliver('checkout.session.completed', {'metadata': {'user_id': 'user-one', 'plan': 'pro'}, 'payment_status': 'unpaid'})
        request._upsert_subscription.assert_not_called()

    def test_paid_checkout_activates_the_selected_plan(self):
        request = self.deliver('checkout.session.completed', {'metadata': {'user_id': 'user-one', 'plan': 'pro'}, 'payment_status': 'paid'})
        request._upsert_subscription.assert_called_once_with('user-one', 'pro', 'active')

    def test_missing_storage_configuration_raises(self):
        request = object.__new__(checkout.handler)
        with patch.object(checkout, 'SUPABASE_SERVICE_KEY', ''):
            with self.assertRaises(RuntimeError):
                request._upsert_subscription('user-one', 'pro', 'active')

    def test_failed_lookup_does_not_attempt_to_insert_a_duplicate_account(self):
        request = object.__new__(checkout.handler)
        with patch.object(checkout, 'SUPABASE_SERVICE_KEY', 'test-key'), patch.object(checkout.urllib.request, 'urlopen', side_effect=OSError('offline')) as fetch:
            with self.assertRaises(RuntimeError):
                request._upsert_subscription('user-one', 'pro', 'active')
            self.assertEqual(fetch.call_count, 1)


if __name__ == '__main__':
    unittest.main()
