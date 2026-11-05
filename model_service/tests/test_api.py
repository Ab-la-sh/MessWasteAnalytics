"""Exercise the real trained model and its authenticated HTTP API."""
import os
import unittest

os.environ['MODEL_API_KEY'] = 'local-test-key'
from fastapi.testclient import TestClient
from model_service.app import app

client = TestClient(app)


class ModelApiTests(unittest.TestCase):
    def test_health(self):
        response = client.get('/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['classes'], list(range(3, 10)))
        self.assertGreater(response.json()['features'], 0)

    def test_auth_required(self):
        for headers in ({}, {'X-API-Key': 'wrong-key'}):
            self.assertEqual(client.post('/predict/batch', headers=headers,
                json={'items': [{'date': '2025-01-16'}]}).status_code, 401)

    def test_real_batch_predictions(self):
        items = [
            {'date': '2025-01-16', 'has_dosa': True, 'n_dishes': 17},
            {'date': '2025-08-01', 'has_biryani': True, 'temp_mean_c': 31,
             'crates_rollmean7': 7},
        ]
        response = client.post('/predict/batch', headers={'X-API-Key': 'local-test-key'},
                               json={'items': items})
        self.assertEqual(response.status_code, 200, response.text)
        predictions = response.json()['predictions']
        self.assertEqual([p['date'] for p in predictions], [i['date'] for i in items])
        for p in predictions:
            self.assertTrue(90 <= p['range_low_kg'] <= p['expected_kg'] <= p['range_high_kg'] <= 270)
            self.assertAlmostEqual(sum(p['class_probabilities'].values()), 1, places=3)
            self.assertAlmostEqual(p['expected_kg'], 30 * p['expected_crates'], delta=0.03)

    def test_validation(self):
        for items in ([], [{'date': 'bad-date'}], [{'date': '2025-01-01'}] * 32):
            self.assertEqual(client.post('/predict/batch',
                headers={'X-API-Key': 'local-test-key'}, json={'items': items}).status_code, 422)


if __name__ == '__main__':
    unittest.main()
