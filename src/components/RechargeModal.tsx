import React, { useState } from "react";
import { motion } from "motion/react";
import { X, Zap, Calendar, Sparkles, CheckCircle2, ShieldCheck, Flame } from "lucide-react";

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCheckInClick: () => void;
  isElderlyMode: boolean;
}

interface PackageItem {
  id: string;
  name: string;
  credits: number;
  bonus: number;
  price: string;
  tag?: string;
  desc: string;
}

export default function RechargeModal({ isOpen, onClose, onCheckInClick, isElderlyMode }: RechargeModalProps) {
  const [selectedPkg, setSelectedPkg] = useState<string>("pkg_popular");

  if (!isOpen) return null;

  const packages: PackageItem[] = [
    {
      id: "pkg_basic",
      name: "体验包",
      credits: 5,
      bonus: 0,
      price: "¥15",
      desc: "适合轻度辟谣体验 (¥3/次)"
    },
    {
      id: "pkg_popular",
      name: "超值包",
      credits: 20,
      bonus: 2,
      price: "¥58",
      tag: "🔥 最受欢迎",
      desc: "加赠 2 次，单次低至 2.6 元"
    },
    {
      id: "pkg_pro",
      name: "深度包",
      credits: 50,
      bonus: 10,
      price: "¥138",
      tag: "⚡ 深度排查",
      desc: "加赠 10 次，单次低至 2.3 元"
    },
    {
      id: "pkg_vip",
      name: "尊享包",
      credits: 100,
      bonus: 20,
      price: "¥268",
      tag: "👑 机构首选",
      desc: "共 120 次，单次低至 2.2 元"
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className={`w-full max-w-lg rounded-3xl p-6 sm:p-8 flex flex-col gap-6 shadow-2xl relative text-left ${
          isElderlyMode 
            ? "bg-white border-4 border-black text-black" 
            : "bg-[#FAF8F5] border border-[#d0ccc4]/50 text-[#2C2C2C]"
        }`}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className={`absolute top-4 right-4 w-9 h-9 rounded-full flex items-center justify-center cursor-pointer transition-colors border-none ${
            isElderlyMode 
              ? "bg-black/5 hover:bg-black/10 text-black font-bold" 
              : "bg-[#d0ccc4]/20 hover:bg-[#d0ccc4]/40 text-[#2C2C2C]/60"
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex flex-col gap-1 pr-6">
          <div className="flex items-center gap-2">
            <span className={`p-2 rounded-xl flex items-center justify-center ${
              isElderlyMode ? "bg-amber-100 text-amber-900" : "bg-[#A96159]/10 text-[#A96159]"
            }`}>
              <Zap className="w-5 h-5" />
            </span>
            <h3 className={isElderlyMode ? "text-3xl font-black text-black" : "text-xl font-bold text-[#2C2C2C]"}>
              额度充值中心
            </h3>
          </div>
          <p className={isElderlyMode ? "text-lg font-bold text-gray-700 mt-1" : "text-xs text-[#2C2C2C]/60 mt-1"}>
            您的当前核查额度已用尽。选择额度套餐或每日签到获取免费额度！
          </p>
        </div>

        {/* Packages Grid */}
        <div className="grid grid-cols-2 gap-3">
          {packages.map((pkg) => {
            const isSelected = selectedPkg === pkg.id;
            return (
              <div
                key={pkg.id}
                onClick={() => setSelectedPkg(pkg.id)}
                className={`relative p-3.5 sm:p-4 rounded-2xl cursor-pointer border-2 transition-all flex flex-col justify-between ${
                  isSelected
                    ? (isElderlyMode ? "border-green-600 bg-green-50/50 shadow-md" : "border-[#A96159] bg-[#A96159]/5 shadow-sm")
                    : (isElderlyMode ? "border-black/20 bg-white hover:border-black/50" : "border-[#d0ccc4]/40 bg-white/60 hover:border-[#A96159]/50")
                }`}
              >
                {pkg.tag && (
                  <span className={`absolute -top-2.5 right-3 text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-full shadow-sm ${
                    isElderlyMode ? "bg-red-600 text-white" : "bg-[#A96159] text-white"
                  }`}>
                    {pkg.tag}
                  </span>
                )}
                <div>
                  <div className="flex items-center justify-between">
                    <span className={isElderlyMode ? "text-xl font-bold text-black" : "text-sm font-bold text-[#2C2C2C]"}>
                      {pkg.name}
                    </span>
                    <span className={isElderlyMode ? "text-2xl font-black text-green-700" : "text-base font-black text-[#A96159]"}>
                      {pkg.price}
                    </span>
                  </div>
                  <div className={`mt-1 font-semibold ${isElderlyMode ? "text-lg text-black" : "text-xs text-[#2C2C2C]/80"}`}>
                    {pkg.credits + pkg.bonus} 次核查
                  </div>
                </div>
                <div className={`text-[10px] mt-2 pt-2 border-t ${
                  isElderlyMode ? "border-black/10 text-gray-600 text-sm font-medium" : "border-[#d0ccc4]/20 text-[#2C2C2C]/50"
                }`}>
                  {pkg.desc}
                </div>
              </div>
            );
          })}
        </div>

        {/* Feature badges */}
        <div className={`p-3 rounded-2xl flex items-center justify-between text-xs ${
          isElderlyMode ? "bg-gray-100 text-black text-base font-bold" : "bg-[#FAF5F0] border border-[#A96159]/10 text-[#2C2C2C]/70"
        }`}>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span>实时多模型检索</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0" />
            <span>大字报/证据链导出</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>额度永久有效</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => alert("充值支付功能接入中，敬请期待！您可以先通过每日签到领取 3 个核查额度。")}
            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-all border-none shadow-md ${
              isElderlyMode
                ? "bg-green-600 hover:bg-green-700 text-white text-2xl"
                : "bg-[#A96159] hover:bg-[#8e4f48] text-white text-sm"
            }`}
          >
            <span>立即充值（支付通道接入中）</span>
          </button>

          {/* Daily check-in shortcut */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onCheckInClick();
            }}
            className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors border ${
              isElderlyMode
                ? "border-2 border-black bg-white hover:bg-black/5 text-black text-xl"
                : "border-[#d0ccc4]/60 bg-transparent hover:bg-white text-[#2C2C2C]/80 text-xs"
            }`}
          >
            <Calendar className="w-4 h-4 text-[#A96159]" />
            <span>免费获取：今日签到领 3 次额度</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
