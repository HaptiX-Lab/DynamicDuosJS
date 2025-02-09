import { Route, Routes } from "react-router-dom";

import IndexPage from "@/pages/index";
import DocsPage from "@/pages/docs";
import PricingPage from "@/pages/pricing";
import BlogPage from "@/pages/blog";
import AboutPage from "@/pages/about";
import Header from "@/components/header";
import MonitorPage from "@/pages/monitor";
import CalibrationPage from "@/pages/calibration";

function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route element={<IndexPage />} path="/" />
        <Route element={<DocsPage />} path="/docs" />
        <Route element={<PricingPage />} path="/pricing" />
        <Route element={<BlogPage />} path="/blog" />
        <Route element={<AboutPage />} path="/about" />
        <Route element={<MonitorPage />} path="/monitor"/>
        <Route element={<CalibrationPage />} path="/impedance-estimation"/>
      </Routes>
    </>
  );
}

export default App;
