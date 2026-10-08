"""Verify the portfolio proxy reaches the isolated public RAG application."""
import json
import sys
import urllib.error
import urllib.request

base = sys.argv[1].rstrip('/') + '/'
expected_provider = sys.argv[2] if len(sys.argv) > 2 else 'mock'
assert expected_provider in ('mock', 'deepseek')

def call(path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=100) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, None

status, demo = call('api/demo')
assert status == 200 and demo['public_demo'] and demo['read_only']
assert demo['provider'] == expected_provider and demo['embedding'] == 'hash'
assert call('api/chat', {})[0] in (403, 405)
assert call('api/notebooks', {})[0] in (403, 405)
status, result = call('api/demo/chat', {'question': demo['suggested_questions'][0]['question']})
assert status == 200 and result['knowledge_base_ids'] == ['cmrc2018-demo']
status, trace = call('api/trace/' + result['trace_id'])
assert status == 200 and any(s['span'] == 'rag' and s['status'] == 'ok' and s['meta'].get('hit_count', 0) > 0 for s in trace)
print(json.dumps({'portfolio_rag_smoke': 'passed', 'trace_id': result['trace_id'], 'provider': result['provider']}))
