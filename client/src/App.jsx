import { useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Menu from './pages/Menu.jsx';
import Cart from './pages/Cart.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import './App.css';

export default function App() {
  const [cart, setCart] = useState([]);

  return (
    <BrowserRouter>
      <nav className="navbar">
        <Link to="/">Menu</Link>
        <Link to="/cart">Cart ({cart.length})</Link>
        <Link to="/admin">Admin</Link>
      </nav>
      <main className="container">
        <Routes>
          <Route path="/" element={<Menu cart={cart} setCart={setCart} />} />
          <Route path="/cart" element={<Cart cart={cart} setCart={setCart} />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
