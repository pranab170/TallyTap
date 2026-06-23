/* eslint-disable react-hooks/purity */
import { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

// Point Axios to your live backend on Render
axios.defaults.baseURL = 'https://tallytap-backend.onrender.com';

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);

  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  
  // Controls the receipt popup
  const [showReceipt, setShowReceipt] = useState(false);

  useEffect(() => {
    // Force mobile device screen-scaling properties
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.getElementsByTagName('head')[0].appendChild(meta);
    }
    meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

    // Fetch inventory items
    axios.get('/api/products')
      .then(response => {
        if (response.data && Array.isArray(response.data)) {
          setProducts(response.data);
        }
      })
      .catch(error => console.error("Error loading products:", error));
  }, []);

  const handleAddProduct = (e) => {
    e.preventDefault();
    if (!newItemName) return;

    const newProduct = {
      id: String(Date.now() + Math.random()), 
      name: newItemName,
      price: parseFloat(newItemPrice) || 0,
      category: "Custom"
    };

    setProducts(prevProducts => [...prevProducts, newProduct]);
    axios.post('/api/products', newProduct).catch(e => console.error(e));
    setNewItemName('');
    setNewItemPrice('');
  };

  const handleDeleteMenuProduct = (e, id) => {
    e.stopPropagation(); 
    if(window.confirm("Are you sure you want to delete this item?")) {
      setProducts(prevProducts => prevProducts.filter(product => (product.id !== id && product._id !== id)));
      axios.delete(`/api/products/${id}`).catch(e => console.error(e));
    }
  };

  // Har tap par naya row banega, chahe item same ho!
  const addToCart = (product) => {
    const uniqueCartId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : String(Math.random() + Date.now());

    const newCartItem = {
      cartItemId: uniqueCartId,
      id: product.id || product._id,
      name: product.name,
      price: product.price || 0, 
      quantity: 1
    };
    setCart(prevCart => [...prevCart, newCartItem]);
  };

  // CartItemId se update karega taaki sirf wahi row change ho
  const updateCartItem = (cartItemId, key, value) => {
    setCart(prevCart => prevCart.map(item => item.cartItemId === cartItemId ? { ...item, [key]: parseFloat(value) || 0 } : item));
  };

  // Cart se remove karne ke liye bhi cartItemId use hoga
  const removeFromCart = (cartItemId) => setCart(prevCart => prevCart.filter(item => item.cartItemId !== cartItemId));

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const finalTotal = Math.max(0, subtotal - discount);

  // UPI Configuration Details
  const upiId = "yourname@ybl"; // Replace with your actual UPI ID
  const businessName = "TallyTap POS";
  const upiString = `upi://pay?pa=${upiId}&pn=${businessName}&am=${finalTotal.toFixed(2)}&cu=INR`;

  const handleCheckout = () => {
    setShowReceipt(true);
  };

  const completeOrder = () => {
    setShowReceipt(false);
    setCart([]);
    setDiscount(0);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="main-layout" style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif', margin: 0, padding: 0 }}>
      
      {/* --- RECEIPT MODAL OVERLAY --- */}
      {showReceipt && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '10px' }}>
          <div id="receipt-container" style={{ backgroundColor: 'white', width: '100%', maxWidth: '340px', padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'black', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <h2 style={{ margin: '0 0 10px 0', textAlign: 'center', fontSize: '22px' }}>Jai Shree Ram</h2>
            <h4 style={{ margin: '0 0 15px 0', textAlign: 'center', color: '#555' }}>TallyTap POS System</h4>
            
            <div style={{ width: '100%', borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '10px 0', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px' }}>
                <span>Item</span>
                <span>Qty</span>
                <span>Amount</span>
              </div>
              {cart.map((item, index) => (
                <div key={item.cartItemId || index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px' }}>
                  <span style={{ flex: 2, marginRight: '5px', wordBreak: 'break-word' }}>{item.name}</span>
                  <span style={{ flex: 1, textAlign: 'center' }}>{item.quantity}</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>₹{(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', marginBottom: '15px' }}>
              <span>Total Payable:</span>
              <span>₹{finalTotal.toFixed(2)}</span>
            </div>

            <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>Scan to Pay via UPI</p>
            <div style={{ padding: '8px', border: '2px solid #eee', borderRadius: '8px', marginBottom: '15px', backgroundColor: 'white' }}>
               <QRCodeSVG value={upiString} size={130} />
            </div>

            <p style={{ textAlign: 'center', fontWeight: 'bold', margin: '0 0 4px 0', fontSize: '14px' }}>Thank you for visiting!</p>
            <p style={{ textAlign: 'center', fontSize: '12px', margin: 0, color: '#555' }}>Please visit again.</p>

            <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '20px', width: '100%' }}>
              <button onClick={handlePrint} style={{ flex: 1, padding: '12px 6px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>Print Receipt</button>
              <button onClick={completeOrder} style={{ flex: 1, padding: '12px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>Close & Clear</button>
            </div>
          </div>
        </div>
      )}

      {/* --- RESPONSIVE LAYOUT & PRINTER CORE CSS Engine --- */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-container, #receipt-container * { visibility: visible; }
          #receipt-container { 
            position: absolute !important; 
            left: 0 !important; 
            top: 0 !important; 
            width: 76mm !important; 
            margin: 0 !important; 
            padding: 5mm !important; 
            border: none !important; 
            box-shadow: none !important; 
            display: block !important;
          }
          .no-print { display: none !important; }
        }

        @media (max-width: 768px) {
          .main-layout { flex-direction: column !important; height: auto !important; }
          .menu-pane { height: auto !important; max-height: 50vh !important; }
          .cart-pane { width: 100% !important; height: auto !important; border-left: none !important; border-top: 2px solid #ddd !important; }
        }
      `}</style>

      {/* --- MENU VIEW PANE --- */}
      <div className="menu-pane" style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5', overflowY: 'auto' }}>
        <div style={{ backgroundColor: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '25px' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#333' }}>Add Product to Menu</h3>
          <form onSubmit={handleAddProduct} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <input type="text" placeholder="Item Name (e.g., Ring)" value={newItemName} onChange={(e) => setNewItemName(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', flex: 2, minWidth: '150px', backgroundColor: 'white', color: 'black' }} />
            <input type="number" placeholder="Default Price (Optional)" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', flex: 1, minWidth: '80px', backgroundColor: 'white', color: 'black' }} />
            <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>+ Add Item</button>
          </form>
        </div>
        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: '10px', color: '#333', fontSize: '20px' }}>Menu Items</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '12px', marginTop: '20px' }}>
          {Array.isArray(products) && products.map(product => {
            const productId = product.id || product._id || String(Math.random());
            return (
              <div key={productId} onClick={() => addToCart(product)} style={{ position: 'relative', backgroundColor: 'white', padding: '20px 10px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.08)', textAlign: 'center', cursor: 'pointer', userSelect: 'none', border: '1px solid #e0e0e0', color: 'black' }}>
                <button onClick={(e) => handleDeleteMenuProduct(e, productId)} style={{ position: 'absolute', top: '5px', right: '8px', background: 'none', border: 'none', color: '#dc3545', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }} title="Delete from menu">✕</button>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#333', wordBreak: 'break-word' }}>{product.name}</div>
                <div style={{ color: '#007BFF', marginTop: '8px', fontWeight: 'bold' }}>{product.price ? `₹${product.price}` : 'Set Price in Cart'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- CHECKOUT CART SIDEBAR PANE --- */}
      <div className="cart-pane" style={{ width: '400px', borderLeft: '2px solid #ddd', display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#fff', color: 'black' }}>
        <div style={{ padding: '20px', borderBottom: '2px solid #eee' }}><h3 style={{ margin: 0 }}>Current Order</h3></div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {cart.length === 0 ? <p style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>Cart is empty. Tap items to add.</p> : cart.map((item, index) => (
            <div key={item.cartItemId || index} style={{ display: 'flex', flexDirection: 'column', padding: '12px 10px', borderBottom: '1px solid #eee', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}><span style={{ fontSize: '15px', color: '#007BFF' }}>{item.name}</span><button onClick={() => removeFromCart(item.cartItemId)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px' }}>✕</button></div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '13px', color: '#555' }}>Price: <input type="number" value={item.price || ''} placeholder="0" onChange={(e) => updateCartItem(item.cartItemId, 'price', e.target.value)} style={{ width: '70px', marginLeft: '3px', padding: '4px', backgroundColor: 'white', color: 'black', border: '1px solid #28a745', fontWeight: 'bold' }} /></label>
                <label style={{ fontSize: '13px', color: '#555' }}>Qty: <input type="number" value={item.quantity} onChange={(e) => updateCartItem(item.cartItemId, 'quantity', e.target.value)} style={{ width: '45px', marginLeft: '3px', padding: '4px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc' }} /></label>
                <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: '#333' }}>₹{(item.price * item.quantity).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '20px', backgroundColor: '#fafafa', borderTop: '2px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#555', fontSize: '14px' }}><span>Subtotal:</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: '#555', fontSize: '14px' }}><span>Discount (₹):</span><input type="number" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: '80px', textAlign: 'right', padding: '5px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', borderTop: '1px solid #ddd', paddingTop: '15px', marginBottom: '20px', color: '#333' }}><span>Total:</span><span>₹{finalTotal.toFixed(2)}</span></div>
          <button onClick={handleCheckout} disabled={cart.length === 0} style={{ width: '100%', padding: '16px', backgroundColor: cart.length === 0 ? '#cccccc' : '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: cart.length === 0 ? 'not-allowed' : 'pointer' }}>Checkout & Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

export default App;