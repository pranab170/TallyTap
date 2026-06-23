from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

# Our internal memory list of products
MOCK_PRODUCTS = [
    {"id": 1, "name": "Samosa", "price": 15.0, "category": "Snacks"},
    {"id": 2, "name": "Chai", "price": 10.0, "category": "Beverages"},
    {"id": 3, "name": "Cold Drink", "price": 40.0, "category": "Beverages"}
]

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({"status": "Backend is running smoothly"})

@app.route('/api/products', methods=['GET', 'POST'])
def handle_products():
    if request.method == 'POST':
        new_item = request.json
        MOCK_PRODUCTS.append(new_item)
        return jsonify({"message": "Item added successfully!", "item": new_item}), 201
    
    return jsonify(MOCK_PRODUCTS)

# NEW ROUTE: Handles deleting a specific item by its ID
@app.route('/api/products/<int:item_id>', methods=['DELETE'])
def delete_product(item_id):
    global MOCK_PRODUCTS
    # Rebuild the list without the item that matches the given ID
    MOCK_PRODUCTS = [product for product in MOCK_PRODUCTS if product['id'] != item_id]
    return jsonify({"message": "Item deleted successfully!"}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', debug=True, port=5000)