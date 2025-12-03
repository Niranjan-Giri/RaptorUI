from flask import Flask, request, jsonify
from flask_cors import CORS
from pathlib import Path
import os
import config as con
from ply_processor import auto_generate_info_json

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Configuration
PUBLIC_DIR = Path(__file__).parent.parent / 'public'
INFO_JSON_PATH = PUBLIC_DIR / 'info.json'

# Auto-generate info.json on startup if it doesn't exist or if PLY files changed
def initialize_scene_info():
    """Generate info.json from PLY files on server startup"""
    print("\n" + "="*60)
    print("Initializing Scene Info...")
    print("="*60)
    
    if not PUBLIC_DIR.exists():
        print(f"Warning: Public directory not found: {PUBLIC_DIR}")
        return
    
    # Check if info.json exists
    if INFO_JSON_PATH.exists():
        print(f"✓ info.json already exists at {INFO_JSON_PATH}")
        print("  To regenerate, delete the file or call /api/regenerate-info")
    else:
        print(f"✗ info.json not found, generating from PLY files...")
        success = auto_generate_info_json(str(PUBLIC_DIR), str(INFO_JSON_PATH))
        if success:
            print("✓ info.json generated successfully!")
        else:
            print("✗ Failed to generate info.json (no PLY files found?)")
    
    print("="*60 + "\n")

# Initialize on startup
initialize_scene_info()


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


@app.route('/api/regenerate-info', methods=['POST'])
def regenerate_info():
    """
    Force regenerate info.json from current PLY files
    """
    try:
        print("\n[API] Regenerating info.json...")
        
        # Remove existing info.json if present
        if INFO_JSON_PATH.exists():
            INFO_JSON_PATH.unlink()
            print(f"[API] Removed existing {INFO_JSON_PATH}")
        
        # Generate new info.json
        success = auto_generate_info_json(str(PUBLIC_DIR), str(INFO_JSON_PATH))
        
        if success:
            # Read and return the generated info
            with open(INFO_JSON_PATH, 'r') as f:
                import json
                info = json.load(f)
            
            return jsonify({
                'success': True,
                'message': 'info.json regenerated successfully',
                'info': info,
                'file_count': len(info.get('name', {}))
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to generate info.json. Are there PLY files in the public directory?'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/scene-info', methods=['GET'])
def get_scene_info():
    """
    Get current scene info (generates if missing)
    """
    try:
        # Check if info.json exists
        if not INFO_JSON_PATH.exists():
            print("[API] info.json not found, generating...")
            success = auto_generate_info_json(str(PUBLIC_DIR), str(INFO_JSON_PATH))
            if not success:
                return jsonify({
                    'success': False,
                    'error': 'No PLY files found in public directory'
                }), 404
        
        # Read and return info.json
        with open(INFO_JSON_PATH, 'r') as f:
            import json
            info = json.load(f)
        
        return jsonify({
            'success': True,
            'info': info,
            'auto_generated': True,  # Mark as backend-generated
            'file_count': len(info.get('name', {}))
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/ply-files', methods=['GET'])
def list_ply_files():
    """
    List all PLY files in the public directory
    """
    try:
        ply_files = []
        
        if PUBLIC_DIR.exists():
            for file in PUBLIC_DIR.glob('*.ply'):
                if file.is_file():
                    ply_files.append({
                        'filename': file.name,
                        'size': file.stat().st_size,
                        'path': f'/{file.name}'
                    })
            
            # Also check uppercase
            for file in PUBLIC_DIR.glob('*.PLY'):
                if file.is_file():
                    ply_files.append({
                        'filename': file.name,
                        'size': file.stat().st_size,
                        'path': f'/{file.name}'
                    })
        
        return jsonify({
            'success': True,
            'files': sorted(ply_files, key=lambda x: x['filename']),
            'count': len(ply_files)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
