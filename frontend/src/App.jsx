import React, { useState, useEffect } from 'react';
import axios from 'axios';
// Point Axios to your computer's IP instead of localhost
axios.defaults.baseURL = 'https://your-tallytap-backend.onrender.com';
import { QRCodeSVG } from 'qrcode.react'; // New import for QR Code

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  
  // NEW STATE: Controls the receipt popup
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    axios.get('/api/products')
      .then(response => setProducts(response.data))
      .catch(error => console.error("Error loading products:", error));
  }, []);

  const handleAddProduct = (e) => {
    e.preventDefault();
    if (!newItemName || !newItemPrice) return;

    const newProduct = {
      id: Date.now(), 
      name: newItemName,
      price: parseFloat(newItemPrice) || 0,
      category: "Custom"
    };

    setProducts([...products, newProduct]);
    axios.post('/api/products', newProduct).catch(e => console.error(e));
    setNewItemName('');
    setNewItemPrice('');
  };

  const handleDeleteMenuProduct = (e, id) => {
    e.stopPropagation(); 
    if(window.confirm("Are you sure you want to delete this item?")) {
      setProducts(products.filter(product => product.id !== id));
      axios.delete(`/api/products/${id}`).catch(e => console.error(e));
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.id === product.id);
    if (existing) {
      setCart(cart.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item));
    } else {
      setCart([...cart, { ...product, quantity: 1 }]);
    }
  };

  const updateCartItem = (id, key, value) => {
    setCart(cart.map(item => item.id === id ? { ...item, [key]: parseFloat(value) || 0 } : item));
  };

  const removeFromCart = (id) => setCart(cart.filter(item => item.id !== id));

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const finalTotal = Math.max(0, subtotal - discount);

  // YOUR UPI DETAILS GO HERE
  const upiId = "yourname@ybl"; // Replace with your actual UPI ID
  const businessName = "TallyTap POS";
  // Standard Indian UPI Intent Link
  const upiString = `upi://pay?pa=${upiId}&pn=${businessName}&am=${finalTotal.toFixed(2)}&cu=INR`;

  // Trigger Receipt instead of standard Alert
  const handleCheckout = () => {
    setShowReceipt(true);
  };

  // Close receipt and clear cart
  const completeOrder = () => {
    setShowReceipt(false);
    setCart([]);
    setDiscount(0);
  };

  // Print function (Hooks into Android's native print system)
  const handlePrint = () => {
    window.print();
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', margin: 0, padding: 0 }}>
      
      {/* --- RECEIPT MODAL OVERLAY --- */}
      {showReceipt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          
          {/* Printable Area - We assign the ID 'receipt-container' to print only this part */}
          <div id="receipt-container" style={{ backgroundColor: 'white', width: '350px', padding: '30px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'black' }}>
            
            <h2 style={{ margin: '0 0 15px 0', textAlign: 'center' }}>Jai Shree Ram</h2>
            <h4 style={{ margin: '0 0 20px 0', textAlign: 'center', color: '#555' }}>TallyTap POS System</h4>
            
            <div style={{ width: '100%', borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '15px 0', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '10px' }}>
                <span>Item</span>
                <span>Qty</span>
                <span>Amount</span>
              </div>
              {cart.map(item => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '14px' }}>
                  <span style={{ flex: 2 }}>{item.name}</span>
                  <span style={{ flex: 1, textAlign: 'center' }}>{item.quantity}</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px', marginBottom: '20px' }}>
              <span>Total Payable:</span>
              <span>₹{finalTotal.toFixed(2)}</span>
            </div>

            <p style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>Scan to Pay via UPI</p>
            <div style={{ padding: '10px', border: '2px solid #eee', borderRadius: '8px', marginBottom: '20px' }}>
               <QRCodeSVG value={upiString} size={150} />
            </div>

            <p style={{ textAlign: 'center', fontWeight: 'bold', margin: '0 0 5px 0' }}>Thank you for visiting!</p>
            <p style={{ textAlign: 'center', fontSize: '14px', margin: 0, color: '#555' }}>Please visit again.</p>

            {/* Print & Close Buttons (These are hidden during actual printing via CSS) */}
            <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '30px', width: '100%' }}>
              <button onClick={handlePrint} style={{ flex: 1, padding: '12px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>Print Receipt</button>
              <button onClick={completeOrder} style={{ flex: 1, padding: '12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>Close & Clear</button>
            </div>
          </div>
        </div>
      )}

      {/* --- CSS to Hide Buttons During Printing --- */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-container, #receipt-container * { visibility: visible; }
          #receipt-container { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; border: none; box-shadow: none; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* --- REST OF THE APP (Left & Right Panes) --- */}
      {/* ... (Keep the exact same Left Pane and Right Pane code here from the previous step) ... */}
      <div style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5', overflowY: 'auto' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '25px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Add Custom Item to Menu</h3>
          <form onSubmit={handleAddProduct} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Item Name (e.g., Samosa)" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', flex: 2, backgroundColor: 'white', color: 'black' }} />
            <input type="number" placeholder="Price (₹)" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', flex: 1, backgroundColor: 'white', color: 'black' }} />
            <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>+ Add Item</button>
          </form>
        </div>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: '10px', color: '#333' }}>Menu Items</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '15px', marginTop: '20px' }}>
          {products.map(product => (
            <div key={product.id} onClick={() => addToCart(product)} style={{ position: 'relative', backgroundColor: 'white', padding: '25px 15px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', textAlign: 'center', cursor: 'pointer', userSelect: 'none', border: '1px solid #e0e0e0', color: 'black' }}>
              <button onClick={(e) => handleDeleteMenuProduct(e, product.id)} style={{ position: 'absolute', top: '5px', right: '8px', background: 'none', border: 'none', color: '#dc3545', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }} title="Delete from menu">✕</button>
              <div style={{ fontWeight: 'bold', fontSize: '18px', color: '#333' }}>{product.name}</div>
              <div style={{ color: '#007BFF', marginTop: '8px', fontWeight: 'bold' }}>₹{product.price}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ width: '400px', borderLeft: '2px solid #ddd', display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#fff', color: 'black' }}>
        <div style={{ padding: '20px', borderBottom: '2px solid #eee' }}><h3 style={{ margin: 0 }}>Current Order</h3></div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {cart.length === 0 ? <p style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>Cart is empty. Tap items to add.</p> : cart.map(item => (
            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', padding: '15px 10px', borderBottom: '1px solid #eee', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span style={{ fontSize: '16px' }}>{item.name}</span><button onClick={() => removeFromCart(item.id)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px' }}>✕</button></div>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <label style={{ fontSize: '13px', color: '#555' }}>Price: <input type="number" value={item.price} onChange={(e) => updateCartItem(item.id, 'price', e.target.value)} style={{ width: '60px', marginLeft: '5px', padding: '4px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc' }} /></label>
                <label style={{ fontSize: '13px', color: '#555' }}>Qty: <input type="number" value={item.quantity} onChange={(e) => updateCartItem(item.id, 'quantity', e.target.value)} style={{ width: '45px', marginLeft: '5px', padding: '4px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc' }} /></label>
                <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: '#333' }}>₹{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '20px', backgroundColor: '#fafafa', borderTop: '2px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#555' }}><span>Subtotal:</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: '#555' }}><span>Discount (₹):</span><input type="number" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: '80px', textAlign: 'right', padding: '5px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '22px', borderTop: '1px solid #ddd', paddingTop: '15px', marginBottom: '20px', color: '#333' }}><span>Total:</span><span>₹{finalTotal.toFixed(2)}</span></div>
          <button onClick={handleCheckout} disabled={cart.length === 0} style={{ width: '100%', padding: '18px', backgroundColor: cart.length === 0 ? '#cccccc' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '18px', fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}>Checkout & Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

export default App;