"use client";

import { useState } from "react";
import { BiLogoTelegram } from "react-icons/bi";
import Toast from "../components/toast";
import Input from "../components/input";
import MultiSelect from "../components/multi-select";

export default function RegisterPage() {
  const [openIndustry, setOpenIndustry] = useState(false);
  const [openSignal, setOpenSignal] = useState(false);

  return (
    <main className="min-h-screen w-full flex items-center justify-center lg:justify-start">
      <Toast type="success" text="Example success message" visible />

      <div className="w-full max-w-lg p-6 lg:max-w-2xl lg:w-1/2 lg:pl-24 xl:pl-32">
        <header className="mb-6">
          <h2 className="text-3xl font-bold text-black">Welcome to Pulse AI</h2>
          <p className="text-gray-500 mt-2 text-sm">
            Please confirm your details to join the private beta.
          </p>
        </header>

        <form className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Input label="First Name" placeholder="First Name" />
            <Input label="Last Name" placeholder="Last Name" />
          </div>

          <Input
            label="Email"
            type="email"
            placeholder="your.email@gmail.com"
          />

          <div>
            <label className="block text-sm font-semibold text-black mb-2">
              Phone
            </label>
            <div className="flex items-center">
              <span className="bg-gray-100 px-4 py-2.5 rounded-l-lg border border-r-0 border-gray-200 font-semibold text-black">
                +994
              </span>
              <input
                type="tel"
                placeholder="50 123 45 67"
                className="flex-1 w-full bg-white rounded-r-lg py-2.5 px-4 text-black shadow-[inset_4px_4px_8px_#e6e6e6,inset_-4px_-4px_8px_#ffffff] outline-none transition-shadow duration-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <MultiSelect
              label="Industries"
              open={openIndustry}
              setOpen={setOpenIndustry}
            />
            <MultiSelect
              label="Signals"
              open={openSignal}
              setOpen={setOpenSignal}
            />
          </div>

          <Input
            label="Invite Code"
            labelHelper="6-character code"
            placeholder="ABCD12"
          />

          <div className="pt-2 space-y-5">
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="flex-1 bg-black text-white rounded-lg p-3 font-semibold transition-all duration-300 ease-in-out hover:bg-gray-800"
              >
                <span className="inline-flex items-center gap-2 justify-center">
                  <BiLogoTelegram className="w-5 h-5" />
                  Verify & Connect
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
