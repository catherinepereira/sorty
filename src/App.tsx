import { Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { DatasetPage } from "./pages/DatasetPage";
import { BinPage } from "./pages/BinPage";

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/d/:name" element={<DatasetPage />} />
        <Route path="/d/:name/bin" element={<BinPage />} />
      </Routes>
    </div>
  );
}
