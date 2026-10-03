import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import { LoadingState } from './components/ui.jsx';
import { RedirectIfAuthed, RequireAdmin, RequireAuth } from './components/guards.jsx';

import Home from './pages/Home.jsx';
import Menu from './pages/Menu.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Pay from './pages/Pay.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Track from './pages/Track.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Orders from './pages/Orders.jsx';
import Offers from './pages/Offers.jsx';
import Profile from './pages/Profile.jsx';
import NotFound from './pages/NotFound.jsx';

import AdminLogin from './pages/admin/AdminLogin.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminMenu from './pages/admin/AdminMenu.jsx';
import AdminCoupons from './pages/admin/AdminCoupons.jsx';
import AdminSettings from './pages/admin/AdminSettings.jsx';

/** Scrolls to the top on navigation, but never fights an in-page anchor. */
function ScrollToTop() {
  const { pathname } = useLocation();

  if (!window.location.hash) {
    window.scrollTo(0, 0);
  }

  void pathname;
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />

      <Suspense fallback={<LoadingState />}>
        <Routes>
          {/* ---- student-facing ------------------------------------------- */}
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/menu" element={<Layout><Menu /></Layout>} />
          <Route path="/offers" element={<Layout><Offers /></Layout>} />
          <Route path="/track" element={<Layout><Track /></Layout>} />
          <Route path="/cart" element={<Layout><Cart /></Layout>} />
          <Route path="/checkout" element={<Layout><Checkout /></Layout>} />
          <Route path="/pay/:id" element={<Layout><Pay /></Layout>} />
          <Route path="/order/:id" element={<Layout><OrderDetail /></Layout>} />

          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <Layout hideFooter><Login /></Layout>
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/signup"
            element={
              <RedirectIfAuthed>
                <Layout hideFooter><Signup /></Layout>
              </RedirectIfAuthed>
            }
          />

          <Route
            path="/orders"
            element={
              <RequireAuth>
                <Layout><Orders /></Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Layout><Profile /></Layout>
              </RequireAuth>
            }
          />

          {/* ---- canteen admin -------------------------------------------- */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminDashboard />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/orders"
            element={
              <RequireAdmin>
                <AdminOrders />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/orders/:id"
            element={
              <RequireAdmin>
                <AdminOrders />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/menu"
            element={
              <RequireAdmin>
                <AdminMenu />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/coupons"
            element={
              <RequireAdmin>
                <AdminCoupons />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <RequireAdmin>
                <AdminSettings />
              </RequireAdmin>
            }
          />

          {/* Old bookmarks used /canteen for the portal. */}
          <Route path="/canteen/*" element={<Navigate to="/admin" replace />} />

          <Route path="*" element={<Layout><NotFound /></Layout>} />
        </Routes>
      </Suspense>
    </>
  );
}