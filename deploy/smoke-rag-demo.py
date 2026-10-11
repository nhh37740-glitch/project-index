"""Verify the portfolio proxy reaches the isolated public RAG application."""
import json
import argparse
import sys
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('base')
parser.add_argument('provider', choices=('mock', 'deepseek', 'openrouter'), nargs='?', default='mock')
parser.add_argument('--metadata-only', action='store_true', help='Check routing and model metadata without using a model query')
args = parser.parse_args()
base = args.base.rstrip('/') + '/'
expected_provider = args.provider

def call(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=100) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None

def status_only(path):
    try:
        with urllib.request.urlopen(base + path, timeout=10) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code

status, demo = call('api/demo')
assert status == 200 and demo['public_demo'] and demo['read_only']
assert demo['provider'] == expected_provider and demo['embedding'] == 'hash'
if expected_provider == 'openrouter':
    assert demo['model'] == 'openrouter/free' and demo['free_models_only'] is True
    quota = demo['quota']
    assert quota['scope'] == 'site' and quota['limit'] == 20
    assert 0 <= quota['used'] <= 20 and quota['remaining'] == 20 - quota['used']
for asset in ('static/knowledge_demo.css', 'static/public_demo.css', 'static/public_demo.js'):
    assert status_only(asset) == 200, asset
for private_asset in ('static/index.html', 'static/knowledge_demo.js'):
    assert status_only(private_asset) == 403, private_asset
assert call('api/chat', {})[0] in (403, 405)
assert call('api/notebooks', {})[0] in (403, 405)
if args.metadata_only:
    print(json.dumps({'portfolio_rag_smoke': 'passed', 'metadata_only': True,
                      'provider': demo['provider'], 'model': demo['model'], 'quota': demo.get('quota')}))
    raise SystemExit()
status, result = call('api/demo/chat', {'question': demo['suggested_questions'][0]['question']})
assert status == 200 and result['knowledge_base_ids'] == ['cmrc2018-demo']
status, trace = call('api/trace/' + result['trace_id'])
assert status == 200 and any(s['span'] == 'rag' and s['status'] == 'ok' and s['meta'].get('hit_count', 0) > 0 for s in trace)
print(json.dumps({'portfolio_rag_smoke': 'passed', 'trace_id': result['trace_id'], 'provider': result['provider']}))
