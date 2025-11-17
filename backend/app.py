from flask import Flask, request, jsonify
from flask_cors import CORS
import vanna
from vanna.remote import VannaDefault
from config import VANNA_API_KEY, VANNA_MODEL

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

# Initialize Vanna
vn = VannaDefault(model=VANNA_MODEL, api_key=VANNA_API_KEY)

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
        
        # Generate SQL from natural language
        sql = vn.generate_sql(question)
        
        # Optional: Execute the query if database is connected
        # df = vn.run_sql(sql)
        # results = df.to_dict('records')
        
        return jsonify({
            'success': True,
            'question': question,
            'sql': sql,
            # 'results': results,  # Uncomment if executing queries
            # 'columns': list(df.columns) if not df.empty else []
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/execute', methods=['POST'])
def execute_query():
    """
    Endpoint to execute a SQL query and return results
    """
    try:
        data = request.get_json()
        sql = data.get('sql', '')
        
        if not sql:
            return jsonify({'error': 'No SQL provided'}), 400
        
        # Execute the query
        df = vn.run_sql(sql)
        
        return jsonify({
            'success': True,
            'sql': sql,
            'results': df.to_dict('records'),
            'columns': list(df.columns) if not df.empty else [],
            'row_count': len(df)
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/train', methods=['POST'])
def train_vanna():
    """
    Endpoint to train Vanna with DDL, documentation, or SQL examples
    """
    try:
        data = request.get_json()
        train_type = data.get('type', '')  # 'ddl', 'documentation', or 'sql'
        content = data.get('content', '')
        
        if not train_type or not content:
            return jsonify({'error': 'Missing type or content'}), 400
        
        if train_type == 'ddl':
            vn.train(ddl=content)
        elif train_type == 'documentation':
            vn.train(documentation=content)
        elif train_type == 'sql':
            vn.train(sql=content)
        else:
            return jsonify({'error': 'Invalid train type'}), 400
        
        return jsonify({
            'success': True,
            'message': f'Successfully trained with {train_type}'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint
    """
    return jsonify({
        'status': 'healthy',
        'service': 'Vanna SQL Generator'
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
