from flask import Flask, request, jsonify
from flask_cors import CORS
import config as con
app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests


# Vanna removed. This backend now focuses on local preprocessing only.

# Simple in-memory cache for query -> result
query_cache = {}

def normalize_question(q):
    return q.strip().lower()

def preprocess_query_with_scene(question, scene):
    """
    Try to answer common scene-based questions without invoking Vanna.
    Scene is a list of objects with filename and bounding box metadata.
    Returns a dict response if handled, or None if not handled.
    """
    if not scene or not isinstance(scene, list):
        return None

    q = normalize_question(question)

    # Check for "how many <object>s" or "count <object>s"
    import re
    m = re.search(r"how many (?:of )?(\w+)s?\b|count (?:the )?(\w+)s?\b", q)
    if m:
        object_name = (m.group(1) or m.group(2)).lower()
        count = sum(1 for f in scene if object_name in f.get('filename', '').lower())
        return {
            'success': True,
            'question': question,
            'sql': None,
            'results': [{'object': object_name, 'count': count}],
            'columns': ['object', 'count'],
            'row_count': 1
        }

    # "is there a <object>"
    m = re.search(r"is there (?:a|an|the) (\w+)", q)
    if m:
        object_name = m.group(1).lower()
        exists = any(object_name in f.get('filename', '').lower() for f in scene)
        return {
            'success': True,
            'question': question,
            'sql': None,
            'results': [{'object': object_name, 'exists': exists}],
            'columns': ['object', 'exists'],
            'row_count': 1
        }

    # "where is the <object>"
    m = re.search(r"where is (?:a|an|the) (\w+)", q)
    if m:
        object_name = m.group(1).lower()
        for f in scene:
            if object_name in f.get('filename', '').lower():
                bbox = f.get('bbox', {})
                center = bbox.get('center') if bbox else None
                size = bbox.get('size') if bbox else None
                return {
                    'success': True,
                    'question': question,
                    'sql': None,
                    'results': [{ 'object': object_name, 'center': center, 'size': size, 'filename': f.get('filename') }],
                    'columns': ['object', 'center', 'size', 'filename'],
                    'row_count': 1
                }

    # Vertex count: "how many vertices in <object>" or "vertex count of <object>"
    m = re.search(r"vertex count(?: of)? (?:the )?(\w+)|how many vertices (?:in|for) (\w+)", q)
    if m:
        object_name = (m.group(1) or m.group(2) or '').lower()
        for f in scene:
            if object_name in f.get('filename', '').lower():
                vc = f.get('vertex_count')
                return {
                    'success': True,
                    'question': question,
                    'sql': None,
                    'results': [{ 'filename': f.get('filename'), 'vertex_count': vc }],
                    'columns': ['filename', 'vertex_count'],
                    'row_count': 1
                }

    return None

@app.route('/api/query', methods=['POST'])
def generate_query():
    """
    Endpoint to generate SQL from natural language query
    """
    try:
        data = request.get_json()
        question = data.get('question', '')
        
        if not question:
            return jsonify({'error': 'No question provided'}), 400
        
        # Check cache first
        nq = normalize_question(question)
        if nq in query_cache:
            return jsonify(query_cache[nq])

        # If scene metadata supplied, try preprocessing to answer quickly
        scene = data.get('scene')
        pre = preprocess_query_with_scene(question, scene)
        if pre is not None:
            # Cache and return
            query_cache[nq] = pre
            return jsonify(pre)

        # We do not use Vanna to generate SQL; return not-handled or fall back to the preprocessing result
        return jsonify({ 'success': False, 'error': 'Query not supported for server-side rich generation in this build. Use local info.json-only queries.' }), 400
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/execute', methods=['POST'])
def execute_query_not_supported():
    return jsonify({'success': False, 'error': 'Server-side SQL execution removed. This install uses only JSON mapping.'}), 400


@app.route('/api/train', methods=['POST'])
def train_vanna_not_supported():
    """
    Endpoint to train Vanna with DDL, documentation, or SQL examples
    """
    # Training via Vanna is no longer supported in this build
    return jsonify({'success': False, 'error':'Vanna training is disabled for this build'}), 400


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    """
    return jsonify({
        'status': 'healthy',
        'service': 'Local Info JSON Query Service'
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
