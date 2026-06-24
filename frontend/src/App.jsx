import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';

axios.defaults.baseURL = 'https://tallytap-backend.onrender.com';

// Matches a real MongoDB ObjectId (24 hex chars). Static/legacy products that
// lack a proper _id (or only have an array-index style id like "0", "1"...)
// fail this check, so they never get sent to the DELETE endpoint - this is
// what stops /api/products/0 from ever firing and 500'ing.
const isValidMongoId = (id) => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

// 🛡️ PERSISTENCE FIX: a local, browser-side cache of every product the user
// has added. This exists because the backend can lose items on its own
// (e.g. a Render free-tier restart wiping in-memory data) - this cache is
// the safety net that makes sure an item is NEVER removed from the app on
// its own. It is only ever removed when the user explicitly deletes it.
const getLocalCatalog = () => {
  try {
    const saved = localStorage.getItem('tallytap_local_catalog');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

const saveLocalCatalog = (list) => {
  try {
    localStorage.setItem('tallytap_local_catalog', JSON.stringify(list));
  } catch {
    // localStorage unavailable/full - non-fatal, cache simply won't persist
  }
};

function App() {
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [sidebarItemName, setSidebarItemName] = useState('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  const [bluetoothDevice, setBluetoothDevice] = useState(null);
  const [printCharacteristic, setPrintCharacteristic] = useState(null);
  const [btStatus, setBtStatus] = useState("Disconnected");

  const [focusedProductIndex, setFocusedProductIndex] = useState(0);
  
  const productGridRef = useRef([]);
  // NEW: ref to the catalog grid's container div. Used to read the live
  // computed `grid-template-columns` value so arrow-key nav always matches
  // however many columns are actually rendered at the current breakpoint
  // (4 on desktop, 2 on mobile per the existing @media rule below).
  const catalogGridContainerRef = useRef(null);
  const priceRefs = useRef({});
  const qtyRefs = useRef({});
  const itemNameInputRef = useRef(null);

  const [blacklistedIds, setBlacklistedIds] = useState(() => {
    try {
      const saved = localStorage.getItem('tallytap_deleted_blacklist');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const subtotal = useMemo(() => {
    if (!Array.isArray(cart)) return 0;
    return cart.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 0)), 0);
  }, [cart]);

  const finalTotal = useMemo(() => Math.max(0, subtotal - discount), [subtotal, discount]);

  const upiString = useMemo(() => {
    const upiId = "eazypay.590044339@icici"; 
    const businessName = "TallyTap POS";
    return `upi://pay?pa=${upiId}&pn=${encodeURIComponent(businessName)}&am=${finalTotal.toFixed(2)}&cu=INR`;
  }, [finalTotal]);

  const refreshProductsList = useCallback(() => {
    axios.get('/api/products')
      .then(response => {
        if (response.data && Array.isArray(response.data)) {
          const savedBlacklist = JSON.parse(localStorage.getItem('tallytap_deleted_blacklist') || '[]');
          
          // Step 1: Remove completely blacklisted/deleted ghost items
          const cleanData = response.data.filter(p => {
            const checkId = String(p._id || p.id || p.name);
            const nameStr = String(p.name);
            const lowerName = nameStr.toLowerCase();
            return !savedBlacklist.includes(checkId) && 
                   !savedBlacklist.includes(nameStr) && 
                   !savedBlacklist.includes(lowerName);
          });

          // 🔥 FIX: Step 2: Aggressive Deduplication! 
          // Database mein agar pichle bugs ki wajah se 20 "ring" pade hain, toh screen par sirf 1 aayega.
          const uniqueProducts = [];
          const seenNames = new Set();

          for (const p of cleanData) {
            if (!p.name) continue;
            const lowerName = String(p.name).toLowerCase().trim();
            if (!seenNames.has(lowerName)) {
              seenNames.add(lowerName);
              uniqueProducts.push(p);
            }
          }

          // 🛡️ PERSISTENCE FIX: merge in anything we know about locally that
          // the backend "forgot" (e.g. after a Render free-tier restart
          // wiped its in-memory data). An item only leaves this list when
          // the user explicitly deletes it - never on its own.
          const cachedItems = getLocalCatalog();
          for (const cached of cachedItems) {
            if (!cached.name) continue;
            const lowerName = String(cached.name).toLowerCase().trim();
            const checkId = String(cached._id || cached.id || cached.name);
            const isBlacklisted = savedBlacklist.includes(checkId) ||
                                   savedBlacklist.includes(String(cached.name)) ||
                                   savedBlacklist.includes(lowerName);
            if (!isBlacklisted && !seenNames.has(lowerName)) {
              seenNames.add(lowerName);
              uniqueProducts.push(cached);
            }
          }

          // Alphabetical order, A-Z, by name
          uniqueProducts.sort((a, b) => String(a.name).localeCompare(String(b.name)));

          setProducts(uniqueProducts);
          // Keep the cache itself in sync with whatever is now showing.
          saveLocalCatalog(uniqueProducts);
        }
      })
      .catch(error => console.error("Sync error:", error));
  }, []);

  const handleAddDirectItemToCatalog = (e) => {
    e.preventDefault();
    const newName = sidebarItemName.trim();
    if (!newName) return;

    // 🔥 FIX: Duplicate Item Lock! 
    // Agar screen par item pehle se hai, toh db call rok do taaki aur kachra jama na ho
    const isDuplicate = products.some(p => String(p.name).toLowerCase() === newName.toLowerCase());
    if (isDuplicate) {
      alert(`${newName} is already in the menu catalog!`);
      setSidebarItemName('');
      return;
    }

    // Remove the item from blacklist so it stays in the catalog when re-added
    const savedBlacklist = JSON.parse(localStorage.getItem('tallytap_deleted_blacklist') || '[]');
    const updatedBlacklist = savedBlacklist.filter(id => String(id).toLowerCase() !== newName.toLowerCase());
    setBlacklistedIds(updatedBlacklist);
    localStorage.setItem('tallytap_deleted_blacklist', JSON.stringify(updatedBlacklist));

    // 1. Instant UI Par Dikhao (Optimistic Update)
    const tempLocalId = `local-${Date.now()}`;
    const newProduct = { _id: tempLocalId, id: tempLocalId, name: newName, price: 0 };
    setProducts(prev => 
      [newProduct, ...prev].sort((a, b) => String(a.name).localeCompare(String(b.name)))
    );
    setSidebarItemName('');

    // 🛡️ PERSISTENCE FIX: remember it locally so it stays in the app even
    // if the backend's own storage later forgets it.
    saveLocalCatalog([newProduct, ...getLocalCatalog()]);

    // 2. Backend par bhejo
    axios.post('/api/products', { name: newName, price: 0 })
    .then(() => {
      refreshProductsList();
    })
    .catch(err => {
      console.error(err);
      refreshProductsList();
    });
  };

  const addCatalogItemToCart = useCallback((product) => {
    const uniqueCartId = 'cart-' + String(Math.random()).replace('.', '') + '-' + String(new Date().getTime());

    const newCartItem = {
      cartItemId: uniqueCartId,
      id: product._id || product.id,
      name: product.name,
      price: 0,       
      quantity: 0     
    };
    setCart(prevCart => [...prevCart, newCartItem]);

    setTimeout(() => {
      if (priceRefs.current[uniqueCartId]) {
        priceRefs.current[uniqueCartId].focus();
        priceRefs.current[uniqueCartId].select();
      }
    }, 50);
  }, []);

  const updateCartItem = (cartItemId, key, value) => {
    setCart(prevCart => prevCart.map(item => 
      item.cartItemId === cartItemId ? { ...item, [key]: value === '' ? '' : parseFloat(value) || 0 } : item
    ));
  };

  const removeFromCart = (cartItemId) => setCart(prevCart => prevCart.filter(item => item.cartItemId !== cartItemId));
  
  const handleDeleteMenuProduct = (e, product) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm("Do you want to delete this product completely?")) {
      
      const targetIdStr = String(product._id || product.id || product.name);
      const targetNameStr = String(product.name);

      // Block both the ID, exact Name, and Lowercase Name
      const updatedBlacklist = [...new Set([...blacklistedIds, targetIdStr, targetNameStr, targetNameStr.toLowerCase()])];
      setBlacklistedIds(updatedBlacklist);
      localStorage.setItem('tallytap_deleted_blacklist', JSON.stringify(updatedBlacklist));

      // Instant UI removal
      setProducts(prev => prev.filter(p => 
        String(p.name).toLowerCase() !== targetNameStr.toLowerCase() && 
        String(p._id || p.id) !== targetIdStr
      ));
      setFocusedProductIndex(0);

      // 🛡️ PERSISTENCE FIX: drop it from the local cache too, so it stays
      // gone for good and is never re-merged back in by refreshProductsList.
      const remainingCache = getLocalCatalog().filter(p => 
        String(p.name).toLowerCase() !== targetNameStr.toLowerCase() && 
        String(p._id || p.id) !== targetIdStr
      );
      saveLocalCatalog(remainingCache);
      
      const realDbId = product._id || product.id;
      if (isValidMongoId(realDbId)) {
        axios.delete(`/api/products/${realDbId}`)
          .then(() => console.log("Deleted from database successfully."))
          .catch(() => console.log("Backend 500 bypassed, safely deleted locally."));
      }
    }
  };

  const handleCheckout = () => setShowReceipt(true);
  
  const completeOrder = () => { 
    setShowReceipt(false); 
    setCart([]); 
    setDiscount(0); 
    setSidebarItemName('');
  };

  useEffect(() => {
    refreshProductsList();
  }, [refreshProductsList]);

  // Live date/time display for the top bar
  useEffect(() => {
    const clockTimer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if (showReceipt) return;

      // Read the grid's *actual* current column count instead of assuming 4.
      // This is what makes Up/Down arrow nav correct on the 2-column mobile
      // layout too, with zero hardcoded breakpoint numbers to keep in sync.
      let itemsPerRow = 4;
      if (catalogGridContainerRef.current) {
        const computedCols = window
          .getComputedStyle(catalogGridContainerRef.current)
          .getPropertyValue('grid-template-columns')
          .split(' ')
          .filter(Boolean);
        if (computedCols.length > 0) itemsPerRow = computedCols.length;
      }
      
      if (document.activeElement.tagName === 'INPUT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setFocusedProductIndex((prev) => Math.min(products.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setFocusedProductIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedProductIndex((prev) => Math.min(products.length - 1, prev + itemsPerRow));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedProductIndex((prev) => Math.max(0, prev - itemsPerRow));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (products[focusedProductIndex]) {
          addCatalogItemToCart(products[focusedProductIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [products, focusedProductIndex, showReceipt, addCatalogItemToCart]);

  useEffect(() => {
    if (document.activeElement.tagName !== 'INPUT' && productGridRef.current[focusedProductIndex]) {
      productGridRef.current[focusedProductIndex].focus();
    }
  }, [focusedProductIndex]);

  const connectBluetoothPrinter = async () => {
    try {
      setBtStatus("Scanning devices...");
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] 
      });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristics = await service.getCharacteristics();
      const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

      if (writeChar) {
        setBluetoothDevice(device);
        setPrintCharacteristic(writeChar);
        setBtStatus("Connected 🎉");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const printViaBluetoothDirectly = async () => {
    try {
      if (!printCharacteristic) {
        window.print();
        return;
      }

      const initPrinter = '\x1B\x40'; 
      const centerAlign = '\x1B\x61\x01';
      const leftAlign = '\x1B\x61\x00';
      const boldOn = '\x1B\x45\x01';
      const boldOff = '\x1B\x45\x00';
      const lineFeed = '\n';

      let receiptText = "";
      receiptText += initPrinter + centerAlign + boldOn + "Jai Shree Ram" + lineFeed + boldOff;
      receiptText += "TallyTap POS System" + lineFeed;
      const printDateTime = new Date();
      const printDateStr = printDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const printTimeStr = printDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      receiptText += `${printDateStr} - ${printTimeStr}` + lineFeed;
      receiptText += "--------------------------------" + lineFeed;
      
      receiptText += leftAlign + "Item         Qty  Rate   Amount" + lineFeed;
      receiptText += "--------------------------------" + lineFeed;
      
      cart.forEach(item => {
        const namePart = item.name.substring(0, 11).padEnd(12);
        const qtyPart = String(item.quantity || 0).padStart(4);
        const ratePart = `${(item.price || 0).toFixed(0)}`.padStart(7);
        const amtPart = `${((item.price || 0) * (item.quantity || 0)).toFixed(0)}`.padStart(9);
        receiptText += namePart + qtyPart + ratePart + amtPart + lineFeed;
      });

      receiptText += "--------------------------------" + lineFeed;
      receiptText += boldOn + `Subtotal: Rs.${subtotal.toFixed(2)}`.padStart(32) + lineFeed;
      if (discount > 0) {
        receiptText += `Discount: Rs.${discount.toFixed(2)}`.padStart(32) + lineFeed;
      }
      receiptText += `Total Payable: Rs.${finalTotal.toFixed(2)}`.padStart(32) + boldOff + lineFeed;
      receiptText += "--------------------------------" + lineFeed;
      
      const upiPayload = upiString;
      const storeLen = upiPayload.length + 3;
      const pl = storeLen % 256;
      const ph = Math.floor(storeLen / 256);

      receiptText += centerAlign;
      receiptText += '\x1D\x28\x6B\x04\x00\x31\x41\x32\x00'; 
      receiptText += '\x1D\x28\x6B\x03\x00\x31\x43\x06'; 
      receiptText += '\x1D\x28\x6B\x03\x00\x31\x44\x35\x30'; 
      receiptText += String.fromCharCode(29, 40, 107, pl, ph, 49, 80, 48) + upiPayload; 
      receiptText += '\x1D\x28\x6B\x03\x00\x31\x51\x30'; 
      receiptText += lineFeed;

      receiptText += "Scan QR Code to Pay via UPI" + lineFeed;
      receiptText += "--------------------------------" + lineFeed;
      receiptText += boldOn + "Thank you for visiting!" + boldOff + lineFeed + "Please visit again." + lineFeed + lineFeed;
      
      receiptText += "Contact Us: 9777661498,\n8114677747" + lineFeed;
      receiptText += "--------------------------------" + lineFeed;
      receiptText += "Created by: Pranab Paul\nContact: 9556600299" + lineFeed + lineFeed + lineFeed + lineFeed;

      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(receiptText);

      const chunkSize = 20; 
      for (let i = 0; i < dataBuffer.length; i += chunkSize) {
        const chunk = dataBuffer.slice(i, i + chunkSize);
        await printCharacteristic.writeValue(chunk).catch(err => console.log(err));
      }
    } catch (e) {
      console.error(e);
      window.print();
    }
  };

  return (
    <div className="main-layout" style={{ display: 'flex', width: '100%', height: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", margin: 0, padding: 0, backgroundColor: '#fff', color: '#000', overflow: 'hidden' }}>
      
      <style>{`
        body { margin: 0; padding: 0; overflow: hidden; }

        /* --- Cross-platform polish (iOS / Android / Mac / Windows) --- */
        html, body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }

        /* iOS Safari's 100vh includes the address bar and can clip content.
           This makes the layout truly fill the visible viewport on iPhones. */
        html { height: -webkit-fill-available; }
        @supports (-webkit-touch-callout: none) {
          .main-layout { min-height: -webkit-fill-available; }
        }

        /* Smooth, native-feeling scrolling everywhere (incl. momentum on iOS) */
        html { scroll-behavior: smooth; }
        * { -webkit-overflow-scrolling: touch; }

        /* Slim, modern scrollbar instead of the default chunky one */
        *::-webkit-scrollbar { width: 6px; height: 6px; }
        *::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.25); border-radius: 10px; }
        *::-webkit-scrollbar-track { background: transparent; }
        * { scrollbar-width: thin; }

        /* Tactile press feedback on every button - feels native on touch + mouse */
        button {
          transition: transform 0.12s ease, opacity 0.12s ease, background-color 0.15s ease;
          -webkit-tap-highlight-color: transparent;
        }
        button:active { transform: scale(0.95); opacity: 0.85; }

        /* Smooth, clear focus glow on inputs (helps keyboard-only billing too) */
        input {
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          font-size: 16px !important; /* stops iOS Safari from auto-zooming the page on focus */
        }
        input:focus { border-color: #007BFF !important; box-shadow: 0 0 0 3px rgba(0,123,255,0.15) !important; }

        /* Catalog cards: slightly smoother hover/press feel */
        .catalog-grid > div { transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
        .catalog-grid > div:hover { box-shadow: 0 4px 10px rgba(0,0,0,0.12); }

        @media (max-width: 1024px) {
          body { overflow: auto; } 
          .main-layout {
            flex-direction: column !important;
            overflow-y: auto !important;
            height: auto !important;
          }
          .menu-pane {
            flex: none !important;
            width: 100% !important;
            height: auto !important;
            box-sizing: border-box;
            overflow-y: visible !important;
          }
          .catalog-grid {
            grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)) !important; 
            gap: 10px !important;
          }
          .cart-pane {
            width: 100% !important;
            border-left: none !important;
            border-top: 2px solid #ddd !important;
            height: auto !important;
            box-sizing: border-box;
          }
        }

        @media print {
          .menu-pane, .cart-pane, .no-print, form, h2, h3, button, .receipt-screen-overlay { display: none !important; }
          body * { visibility: hidden !important; }
          #receipt-container, #receipt-container * { visibility: visible !important; }
          #receipt-container { position: absolute !important; left: 0 !important; top: 0 !important; width: 76mm !important; margin: 0 !important; padding: 2mm !important; border: none !important; box-shadow: none !important; display: block !important; background: white !important; color: black !important;}
        }
      `}</style>

      {/* --- RECEIPT MODAL OVERLAY --- */}
      {showReceipt && (
        <div className="receipt-screen-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, padding: '10px' }}>
          <div id="receipt-container" style={{ backgroundColor: 'white', width: '100%', maxWidth: '340px', padding: '20px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'black', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            
            <h2 style={{ margin: '0 0 10px 0', textAlign: 'center', fontSize: '22px', color: 'black' }}>Jai Shree Ram</h2>
            <h4 style={{ margin: '0 0 6px 0', textAlign: 'center', color: '#555' }}>TallyTap POS System</h4>
            <p style={{ margin: '0 0 15px 0', textAlign: 'center', fontSize: '12px', color: '#888' }}>
              {currentDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' • '}
              {currentDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
            
            <div style={{ width: '100%', borderTop: '1px dashed #ccc', borderBottom: '1px dashed #ccc', padding: '10px 0', marginBottom: '15px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginBottom: '8px', fontSize: '14px', color: 'black' }}>
                <span style={{ flex: 2 }}>Item</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Qty</span>
                <span style={{ flex: 1, textAlign: 'center' }}>Rate</span>
                <span style={{ flex: 1, textAlign: 'right' }}>Amount</span>
              </div>
              {cart.map((item, index) => (
                <div key={item.cartItemId || index} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '13px', color: 'black' }}>
                  <span style={{ flex: 2, marginRight: '5px', wordBreak: 'break-word' }}>{item.name}</span>
                  <span style={{ flex: 1, textAlign: 'center' }}>{item.quantity || 0}</span>
                  <span style={{ flex: 1, textAlign: 'center' }}>Rs.{(item.price || 0)}</span>
                  <span style={{ flex: 1, textAlign: 'right' }}>Rs.{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
                </div>
              ))}
            </div>

            <div style={{ width: '100%', fontSize: '14px', marginBottom: '5px', color: 'black', display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal:</span><span>Rs.{subtotal.toFixed(2)}</span>
            </div>
            {discount > 0 && (
              <div style={{ width: '100%', fontSize: '14px', marginBottom: '5px', color: 'red', display: 'flex', justifyContent: 'space-between' }}>
                <span>Discount:</span><span>-Rs.{discount.toFixed(2)}</span>
              </div>
            )}
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', borderTop: '1px solid #eee', paddingTop: '5px', marginBottom: '15px', color: 'black' }}>
              <span>Total Payable:</span><span>Rs.{finalTotal.toFixed(2)}</span>
            </div>

            <p style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>Scan to Pay via UPI</p>
            <div style={{ padding: '8px', border: '2px solid #eee', borderRadius: '8px', marginBottom: '15px', backgroundColor: 'white' }}>
               <QRCodeSVG value={upiString} size={140} />
            </div>

            <p style={{ textAlign: 'center', fontWeight: 'bold', margin: '0 0 4px 0', fontSize: '14px', color: 'black' }}>Thank you for visiting!</p>
            <p style={{ textAlign: 'center', fontSize: '12px', margin: '0 0 10px 0', color: '#555' }}>Please visit again.</p>

            <div style={{ width: '100%', borderTop: '1px dashed #eee', paddingTop: '10px', fontSize: '12px', color: '#333', textAlign: 'center' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Contact Us:</div>
              <div>9777661498, 8114677747</div>
              <div style={{ borderTop: '1px solid #f9f9f9', marginTop: '10px', paddingTop: '5px', fontSize: '11px', color: '#777' }}>
                Created by: <strong>Pranab Paul</strong> (9556600299)
              </div>
            </div>

            <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '20px', width: '100%' }}>
              <button onClick={printViaBluetoothDirectly} style={{ flex: 1, padding: '12px 6px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>
                {printCharacteristic ? "⚡ Direct BT Print" : "Print Receipt"}
              </button>
              <button onClick={completeOrder} style={{ flex: 1, padding: '12px 6px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px' }}>Close & Clear</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MENU VIEW PANE --- */}
      <div className="menu-pane" style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        
        {/* TOP BAR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', padding: '12px 20px', borderRadius: '8px', marginBottom: '20px', color: 'white' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', lineHeight: 1.3 }}>TallyTap POS</div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '6px' }}>
              {currentDateTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              {' • '}
              {currentDateTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <span style={{ fontSize: '14px', color: '#aaa' }}>Printer status: </span>
            <span style={{ fontWeight: 'bold', color: printCharacteristic ? '#28a745' : '#ffc107', fontSize: '14px' }}>
              {printCharacteristic && bluetoothDevice ? `${bluetoothDevice.name || "Printer"} Connected 🚀` : btStatus}
            </span>
          </div>
          <button onClick={connectBluetoothPrinter} style={{ padding: '8px 16px', backgroundColor: printCharacteristic ? '#28a745' : '#6c757d', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', fontSize: '13px' }}>
            {printCharacteristic ? "✓ Printer Paired" : "🔌 Connect BT Printer"}
          </button>
        </div>

        {/* Item Input Form Only */}
        <div style={{ backgroundColor: '#ffffff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', marginBottom: '25px', border: '1px solid #e8e8e8' }}>
          <form onSubmit={handleAddDirectItemToCatalog} style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label htmlFor="itemNameInput" style={{ fontSize: '14px', fontWeight: 'bold', color: '#444' }}>Name</label>
              <input 
                type="text" 
                id="itemNameInput"
                name="itemName"
                ref={itemNameInputRef} 
                placeholder="Item Name" 
                value={sidebarItemName}
                onChange={(e) => setSidebarItemName(e.target.value)}
                style={{ width: '100%', padding: '12px', border: '1px solid #ccc', borderRadius: '6px', fontSize: '14px', backgroundColor: 'white', color: 'black', boxSizing: 'border-box', outline: 'none' }}
                required
              />
            </div>
            <button 
              type="submit" 
              style={{ padding: '0 35px', backgroundColor: '#007BFF', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', height: '45px', boxShadow: '0 2px 5px rgba(0,123,255,0.2)' }}
            >
              ADD ITEM
            </button>
          </form>
        </div>

        <h2 style={{ borderBottom: '2px solid #ddd', paddingBottom: '10px', color: '#333', fontSize: '20px', marginBottom: '15px' }}>
          Menu Catalog
        </h2>
        
        <div className="catalog-grid" ref={catalogGridContainerRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '12px' }}>
          {Array.isArray(products) && products.map((product, idx) => {
            
            // Stable Key ensures React doesn't glitch DOM on DB fetch
            const stableKeyId = `item-${idx}-${product.name}`;
            const isFocused = focusedProductIndex === idx;
            
            return (
              <div 
                key={stableKeyId} 
                ref={el => productGridRef.current[idx] = el}
                tabIndex={0}
                onMouseDown={(e) => {
                  if (!e.target.closest('button')) {
                    addCatalogItemToCart(product);
                  }
                }}
                onFocus={() => setFocusedProductIndex(idx)}
                style={{ 
                  position: 'relative', backgroundColor: 'white', padding: '20px 10px', borderRadius: '8px', 
                  boxShadow: '0 2px 4px rgba(0,0,0,0.08)', textAlign: 'center', cursor: 'pointer', userSelect: 'none', 
                  border: isFocused ? '3px solid #007BFF' : '1px solid #e0e0e0', color: 'black', outline: 'none',
                  transform: isFocused ? 'scale(1.03)' : 'scale(1)', transition: 'all 0.15s ease'
                }}
              >
                <button 
                  onClick={(e) => handleDeleteMenuProduct(e, product)} 
                  style={{ position: 'absolute', top: '2px', right: '4px', background: 'none', border: 'none', color: '#dc3545', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', padding: '8px', zIndex: 10, lineHeight: 1 }}
                >
                  ✕
                </button>
                <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#333', wordBreak: 'break-word', marginTop: '5px' }}>{product.name}</div>
                <div style={{ color: '#007BFF', marginTop: '8px', fontWeight: 'bold' }}>{product.price ? `Rs.${product.price}` : 'Rs.0'}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- CHECKOUT CART SIDEBAR PANE --- */}
      <div className="cart-pane" style={{ width: '400px', borderLeft: '2px solid #ddd', display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#fff', color: 'black', boxSizing: 'border-box' }}>
        <div style={{ padding: '20px', borderBottom: '2px solid #eee' }}><h3 style={{ margin: 0 }}>Current Order</h3></div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
          {cart.length === 0 ? <p style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>Cart is empty.</p> : cart.map((item) => {
            return (
              <div key={item.cartItemId} style={{ display: 'flex', flexDirection: 'column', padding: '12px 10px', borderBottom: '1px solid #eee', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span style={{ fontSize: '15px', color: '#007BFF' }}>{item.name}</span>
                  <button onClick={() => removeFromCart(item.cartItemId)} style={{ background: 'none', border: 'none', color: '#dc3545', cursor: 'pointer', fontSize: '16px', padding: '8px', lineHeight: 1 }}>✕</button>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  
                  {/* Price Input Field */}
                  <label style={{ fontSize: '13px', color: '#555' }}>Price: 
                    <input 
                      type="number" 
                      id={`price-${item.cartItemId}`}
                      name={`price-${item.cartItemId}`}
                      ref={el => priceRefs.current[item.cartItemId] = el}
                      value={item.price} 
                      onChange={(e) => updateCartItem(item.cartItemId, 'price', e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'ArrowRight') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (qtyRefs.current[item.cartItemId]) {
                            qtyRefs.current[item.cartItemId].focus();
                            qtyRefs.current[item.cartItemId].select();
                          }
                        }
                      }}
                      style={{ width: '70px', marginLeft: '3px', padding: '4px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc', outline: 'none' }} 
                    />
                  </label>

                  {/* Quantity Input Field */}
                  <label style={{ fontSize: '13px', color: '#555' }}>Qty: 
                    <input 
                      type="number" 
                      id={`qty-${item.cartItemId}`}
                      name={`qty-${item.cartItemId}`}
                      ref={el => qtyRefs.current[item.cartItemId] = el}
                      value={item.quantity} 
                      onChange={(e) => updateCartItem(item.cartItemId, 'quantity', e.target.value)} 
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          e.stopPropagation();
                          if (priceRefs.current[item.cartItemId]) {
                            priceRefs.current[item.cartItemId].focus();
                            priceRefs.current[item.cartItemId].select();
                          }
                        } else if (e.key === 'Enter') {
                          e.preventDefault();
                          e.stopPropagation();
                          e.target.blur(); 
                          
                          if (productGridRef.current[focusedProductIndex]) {
                            productGridRef.current[focusedProductIndex].focus();
                          }
                        }
                      }}
                      style={{ width: '45px', marginLeft: '3px', padding: '4px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc', outline: 'none' }} 
                    />
                  </label>
                  
                  <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: '#333' }}>Rs.{((item.price || 0) * (item.quantity || 0)).toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* BOTTOM SECTION */}
        <div style={{ padding: '20px', backgroundColor: '#fafafa', borderTop: '2px solid #eee' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#555', fontSize: '14px' }}><span>Subtotal:</span><span>Rs.{subtotal.toFixed(2)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', color: '#555', fontSize: '14px' }}><label htmlFor="discountInput">Discount (Rs.):</label><input type="number" id="discountInput" name="discount" value={discount} onChange={(e) => setDiscount(parseFloat(e.target.value) || 0)} style={{ width: '80px', textAlign: 'right', padding: '5px', backgroundColor: 'white', color: 'black', border: '1px solid #ccc' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '20px', borderTop: '1px solid #ddd', paddingTop: '15px', marginBottom: '20px', color: '#333' }}><span>Total:</span><span>Rs.{finalTotal.toFixed(2)}</span></div>
          <button onClick={handleCheckout} style={{ width: '100%', padding: '16px', backgroundColor: '#28a745', color: 'white', border: 'none', borderRadius: '5px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Checkout & Print Receipt</button>
        </div>
      </div>
    </div>
  );
}

export default App;