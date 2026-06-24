import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';

axios.defaults.baseURL = 'https://tallytap-backend.onrender.com';

const isValidMongoId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]); // Cart state use ho rahi hai
  const [sidebarItemName, setSidebarItemName] = useState('');
  
  // Hooks jo pehle unused the, ab yahan UI mein use honge
  const productGridRef = useRef([]); 
  const itemNameInputRef = useRef(null);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0), [cart]);

  const [blacklistedIds, setBlacklistedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('tallytap_deleted_blacklist');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const refreshProductsList = useCallback(() => {
    axios.get('/api/products')
      .then(response => {
        const savedBlacklist = JSON.parse(localStorage.getItem('tallytap_deleted_blacklist') || '[]');
        const cleanData = response.data.filter(p => !savedBlacklist.includes(String(p._id || p.id || p.name)));
        setProducts(cleanData);
      })
      .catch(err => console.error(err));
  }, []);

  const handleAddDirectItemToCatalog = (e) => {
    e.preventDefault();
    const newName = sidebarItemName.trim();
    if (!newName) return;
    setProducts(prev => [{ _id: `local-${Date.now()}`, id: `local-${Date.now()}`, name: newName, price: 0 }, ...prev]);
    setSidebarItemName('');
    axios.post('/api/products', { name: newName, price: 0 }).then(() => refreshProductsList());
  };

  const addCatalogItemToCart = (product) => {
    const uniqueCartId = 'cart-' + Math.random().toString(36).substr(2, 9);
    setCart(prev => [...prev, { cartItemId: uniqueCartId, id: product._id || product.id, name: product.name, price: 0, quantity: 1 }]);
  };

  const updateCartItem = (id, k, v) => {
    setCart(prev => prev.map(i => i.cartItemId === id ? { ...i, [k]: parseFloat(v) || 0 } : i));
  };

  useEffect(() => { refreshProductsList(); }, [refreshProductsList]);

  return (
    <div style={{ display: 'flex', padding: '20px', gap: '20px' }}>
      {/* Menu Side */}
      <div>
        <form onSubmit={handleAddDirectItemToCatalog}>
          <input ref={itemNameInputRef} value={sidebarItemName} onChange={(e) => setSidebarItemName(e.target.value)} required />
          <button type="submit">ADD</button>
        </form>
        {products.map((p, idx) => (
          <div key={p._id || p.id} ref={el => productGridRef.current[idx] = el} onClick={() => addCatalogItemToCart(p)} style={{ border: '1px solid #ccc', padding: '10px', margin: '5px' }}>
            {p.name}
          </div>
        ))}
      </div>

      {/* Cart Side */}
      <div>
        <h3>Cart (Subtotal: {subtotal})</h3>
        {cart.map((item) => (
          <div key={item.cartItemId}>
            {item.name}
            <input type="number" value={item.price} onChange={(e) => updateCartItem(item.cartItemId, 'price', e.target.value)} placeholder="Price" />
            <input type="number" value={item.quantity} onChange={(e) => updateCartItem(item.cartItemId, 'quantity', e.target.value)} placeholder="Qty" />
          </div>
        ))}
      </div>
    </div>
  );
}
export default App;