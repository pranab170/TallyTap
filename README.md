=========================================
      🛒 TALLYTAP POS SYSTEM 🛒
=========================================

🌟 OVERVIEW
-----------
TallyTap is a lightning-fast, highly optimized Point of Sale (POS) web application designed for retail stores. It features a seamless keyboard-driven billing workflow, dynamic UPI QR code generation, and direct Web Bluetooth thermal printer integration.


✨ KEY FEATURES
---------------
[1] ⚡ Lightning Fast Billing (Keyboard Optimized)
    * Engineered for zero-mouse operation to maximize checkout speed.
    * Arrow Keys: Navigate seamlessly through the dynamic Menu Catalog grid.
    * Enter: Instantly add the focused item to the cart.
    * Auto-Focus Workflow: Enter (on item) -> Price Input -> Enter/Right -> Qty Input -> Enter -> Back to Grid.

[2] 🖨️ Direct Bluetooth Thermal Printing
    * Native hardware integration using Web Bluetooth API (navigator.bluetooth).
    * Connects directly to ESC/POS thermal printers from the browser.
    * Generates formatted, center-aligned paper receipts instantly.

[3] 💳 Dynamic UPI QR Checkout
    * Auto-generates a dynamic UPI QR Code on the receipt screen using the Merchant VPA.
    * Incorporates exact total amounts after dynamic discount calculations.

[4] 🛡️ Robust State & Error Management (Optimistic UI)
    * Instant UI Updates: Adding or deleting items reflects on the screen instantly (0ms delay).
    * Ghost Item Prevention: Robust localStorage tracking and Blacklisting engine to filter database anomalies.
    * Stable DOM Rendering: Custom strict key binding and onMouseDown event capturing to prevent swallowed clicks.

[5] 📱 Responsive & Fluid Layout
    * Desktop Mode: Locked strictly to 100vh with independent scrolling panes.
    * Mobile/Tablet Mode: Intelligently stacks into a smooth vertical flex layout.


🛠️ TECH STACK
-------------
* Frontend   : React.js, Vite, Axios, qrcode.react
* Backend    : Node.js, Express.js, MongoDB (Atlas)


🚀 QUICK START / LOCAL SETUP
----------------------------
Step 1: Clone the repository
> git clone https://github.com/pranab170/tallytap-pos.git

Step 2: Navigate to the frontend directory
> cd tallytap-pos/frontend

Step 3: Install dependencies
> npm install

Step 4: Configure Backend (Important)
> You will need to set up your own backend server and MongoDB database. 
> Update the `axios.defaults.baseURL` in `App.jsx` with your local or hosted backend API URL.

Step 5: Start the development server
> npm run dev


⌨️ KEYBOARD SHORTCUTS REFERENCE
-------------------------------
[ Navigate Catalog ]     -> Arrow Up / Down / Left / Right
[ Add Item to Cart ]     -> Enter (While focused on a catalog card)
[ Move Price to Qty ]    -> Enter or Arrow Right
[ Move Qty to Price ]    -> Arrow Left
[ Confirm Qty & Return ] -> Enter (While focused on Qty field)


👨‍💻 AUTHOR
----------
Pranab Paul
Contact: +91 9556600299
"Built with passion to streamline retail checkout experiences."
=========================================
