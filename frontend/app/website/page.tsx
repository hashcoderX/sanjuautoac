'use client';

import * as currencyCodes from 'currency-codes';
import * as countries from 'i18n-iso-countries';
import enCountryLocale from 'i18n-iso-countries/langs/en.json';
import Link from 'next/link';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';

countries.registerLocale(enCountryLocale);

const featureCards = [
  {
    title: 'Job Cards',
    description: 'Create, assign and track service jobs.',
  },
  {
    title: 'Vehicle History',
    description: "Keep every vehicle's service history in one place.",
  },
  {
    title: 'Inventory',
    description: 'Know your parts and stock levels at all times.',
  },
  {
    title: 'Invoicing',
    description: 'Create professional invoices and record payments.',
  },
];

const workflowSteps = [
  {
    number: '01',
    title: 'Customer',
    description: 'Add customer and vehicle details.',
  },
  {
    number: '02',
    title: 'Job Card',
    description: 'Create the service job and record the issue.',
  },
  {
    number: '03',
    title: 'Service',
    description: 'Track technicians, parts and job progress.',
  },
  {
    number: '04',
    title: 'Invoice',
    description: 'Complete the job, generate the invoice and record payment.',
  },
];

const businessTypes = [
  {
    title: 'Automobile Service Centers',
    description: 'Handle daily service jobs, diagnostics and delivery workflows.',
    image:
      'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Motorcycle Workshops',
    description: 'Track repairs, parts usage and technician performance in one place.',
    image:
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Repair Garages',
    description: 'Organize customer records, work orders, bills and payments.',
    image:
      'https://images.unsplash.com/photo-1542362567-b07e54358753?auto=format&fit=crop&w=900&q=80',
  },
  {
    title: 'Tyre & Auto Care Centers',
    description: 'Manage routine jobs, stock movement and repeat customer history.',
    image:
      'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80',
  },
];

const pricingPlans = [
  {
    name: 'STARTER',
    price: '$29',
    note: 'For small workshops',
    features: ['1 branch', 'Up to 5 users', 'Job cards and invoicing', 'Basic reports'],
    highlighted: false,
  },
  {
    name: 'PROFESSIONAL',
    price: '$79',
    note: 'For growing service centers',
    features: ['Up to 3 branches', 'Up to 20 users', 'Inventory and purchasing', 'Advanced analytics'],
    highlighted: true,
  },
  {
    name: 'BUSINESS',
    price: '$149',
    note: 'For larger service operations',
    features: ['Multi-branch management', 'Unlimited users', 'HRM and accounts suite', 'Priority support'],
    highlighted: false,
  },
];

const faqs = [
  'What is Service Center Management Software?',
  'Can multiple employees use the system?',
  'Can I manage vehicle service history?',
  'Can I use the system from my phone?',
  'Is the system cloud based?',
  'Can I manage multiple branches?',
  'Can I customize the system?',
  'How secure is my business data?',
];

const countryOptions = Object.entries(countries.getNames('en'))
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const currencyOptions = currencyCodes.data
  .filter((currency) => currency.code && currency.currency)
  .map((currency) => ({
    code: currency.code,
    label: `${currency.code} - ${currency.currency}`,
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

export default function WebsiteLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinSuccessMessage, setJoinSuccessMessage] = useState('');
  const [joinErrorMessage, setJoinErrorMessage] = useState('');
  const [joinForm, setJoinForm] = useState({
    business_name: '',
    business_address: '',
    country: '',
    currency: 'USD',
    contact_number: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
    admin_password_confirmation: '',
  });
  const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

  const openJoinModal = () => {
    setJoinErrorMessage('');
    setJoinSuccessMessage('');
    setJoinModalOpen(true);
  };

  const closeJoinModal = () => {
    setJoinModalOpen(false);
    setJoinSubmitting(false);
  };

  const handleJoinInputChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setJoinForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleJoinSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setJoinErrorMessage('');
    setJoinSuccessMessage('');

    if (joinForm.admin_password !== joinForm.admin_password_confirmation) {
      setJoinErrorMessage('Password confirmation does not match.');
      return;
    }

    if (!API_URL) {
      setJoinErrorMessage('API URL is not configured. Please set NEXT_PUBLIC_API_BASE_URL.');
      return;
    }

    setJoinSubmitting(true);

    const adminEmail = joinForm.admin_email;
    const adminPassword = joinForm.admin_password;

    try {
      const response = await fetch(`${API_URL}/api/saas/join-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(joinForm),
      });

      const payload = await response.json();

      if (!response.ok) {
        const firstError = payload?.errors ? Object.values(payload.errors)[0] : null;
        const firstErrorMessage = Array.isArray(firstError) ? String(firstError[0] || '') : '';
        setJoinErrorMessage(payload?.message || firstErrorMessage || 'Failed to submit your request.');
        setJoinSubmitting(false);
        return;
      }

      setJoinSuccessMessage(
        payload?.message ||
          'Registration request submitted. We will provision your dedicated database and backup namespace after approval.'
      );

      try {
        const loginResponse = await fetch(`${API_URL}/api/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email: adminEmail,
            password: adminPassword,
          }),
        });

        if (loginResponse.ok) {
          const loginPayload = await loginResponse.json();
          if (loginPayload?.token) {
            localStorage.setItem('token', loginPayload.token);
            window.location.href = '/dashboard';
            return;
          }
        }
      } catch {
        // If auto-login fails, keep form success message and allow manual login.
      }

      setJoinForm({
        business_name: '',
        business_address: '',
        country: '',
        currency: 'USD',
        contact_number: '',
        admin_name: '',
        admin_email: '',
        admin_password: '',
        admin_password_confirmation: '',
      });
      window.location.href = '/dashboard/login';
    } catch {
      setJoinErrorMessage('Unable to submit request right now. Please try again.');
    } finally {
      setJoinSubmitting(false);
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.18 }
    );

    const sections = document.querySelectorAll('[data-reveal]');
    sections.forEach((section) => observer.observe(section));

    return () => {
      sections.forEach((section) => observer.unobserve(section));
      observer.disconnect();
    };
  }, []);

  return (
    <main className="bg-[#f7f7f5] text-[#171717]">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-[#f7f7f5]/90 backdrop-blur">
        <nav className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#e4552d] text-sm font-bold text-white">
              SO
            </span>
            <span className="text-lg font-semibold tracking-tight">ServiceOS</span>
          </div>

          <ul className="hidden items-center gap-8 text-sm font-medium text-[#2e2e2e] lg:flex">
            <li>
              <a href="#features" className="transition hover:text-[#e4552d]">
                Features
              </a>
            </li>
            <li>
              <a href="#solutions" className="transition hover:text-[#e4552d]">
                Solutions
              </a>
            </li>
            <li>
              <a href="#how-it-works" className="transition hover:text-[#e4552d]">
                How It Works
              </a>
            </li>
            <li>
              <a href="#pricing" className="transition hover:text-[#e4552d]">
                Pricing
              </a>
            </li>
            <li>
              <a href="#faq" className="transition hover:text-[#e4552d]">
                FAQ
              </a>
            </li>
          </ul>

          <div className="hidden items-center gap-3 lg:flex">
            <Link href="/?view=login" className="rounded-lg px-3 py-2 text-sm font-semibold text-[#242424] hover:bg-black/5">
              Login
            </Link>
            <button
              type="button"
              onClick={openJoinModal}
              className="rounded-lg border border-[#e4552d]/45 px-4 py-2 text-sm font-semibold text-[#e4552d] transition hover:border-[#e4552d] hover:bg-[#fff1ec]"
            >
              Join With Us
            </button>
            <button className="rounded-lg border border-black/15 px-4 py-2 text-sm font-semibold text-[#242424] transition hover:border-black/30">
              Book a Demo
            </button>
            <button className="rounded-lg bg-[#e4552d] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#ca4723]">
              Start Free Trial
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button className="rounded-lg bg-[#e4552d] px-3 py-2 text-xs font-semibold text-white">Start Free Trial</button>
            <button
              type="button"
              aria-label="Toggle menu"
              className="rounded-lg border border-black/15 p-2"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <span className="block h-0.5 w-5 bg-black" />
              <span className="mt-1.5 block h-0.5 w-5 bg-black" />
              <span className="mt-1.5 block h-0.5 w-5 bg-black" />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="border-t border-black/10 bg-white px-5 py-5 lg:hidden">
            <div className="space-y-4 text-sm font-medium">
              <a href="#features" className="block" onClick={() => setMenuOpen(false)}>
                Features
              </a>
              <a href="#solutions" className="block" onClick={() => setMenuOpen(false)}>
                Solutions
              </a>
              <a href="#how-it-works" className="block" onClick={() => setMenuOpen(false)}>
                How It Works
              </a>
              <a href="#pricing" className="block" onClick={() => setMenuOpen(false)}>
                Pricing
              </a>
              <a href="#faq" className="block" onClick={() => setMenuOpen(false)}>
                FAQ
              </a>
              <Link href="/?view=login" className="block" onClick={() => setMenuOpen(false)}>
                Login
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  openJoinModal();
                }}
                className="w-full rounded-lg border border-[#e4552d]/45 px-4 py-3 text-left text-sm font-semibold text-[#e4552d]"
              >
                Join With Us
              </button>
              <button className="mt-2 w-full rounded-lg border border-black/15 px-4 py-3 text-left text-sm font-semibold">
                Book a Demo
              </button>
            </div>
          </div>
        )}
      </header>

      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.46) 45%, rgba(0,0,0,0.3) 100%), url('https://images.unsplash.com/photo-1621905251918-48416bd8575a?auto=format&fit=crop&w=1800&q=80')",
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      >
        <div className="mx-auto grid min-h-[78vh] w-full max-w-[1240px] items-center gap-14 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-10 lg:py-24">
          <div className="animate-rise text-white">
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.2em] text-white/85">
              Service Center Management Software
            </p>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Run Your Service Center.
              <br />
              All in One Place.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/90 sm:text-lg">
              Manage customers, vehicles, job cards, inventory, purchasing, invoicing and accounts from one
              simple platform.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button className="rounded-xl bg-[#e4552d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ca4723]">
                Start Free Trial
              </button>
              <button
                type="button"
                onClick={openJoinModal}
                className="rounded-xl border border-[#e4552d]/60 bg-[#f07a56] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#e4552d]"
              >
                Join With Us
              </button>
              <button className="rounded-xl border border-white/35 bg-white/10 px-6 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20">
                Book a Demo
              </button>
            </div>
            <p className="mt-5 text-sm text-white/80">No complicated setup • Cloud based • Multiple users</p>
          </div>

          <div className="animate-rise-delayed rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-xl">
            <div className="rounded-xl bg-[#0f1115] p-4 text-white shadow-2xl">
              <div className="mb-4 flex items-center justify-between text-xs text-white/70">
                <span>Dashboard Preview</span>
                <span>Live</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {['Today\'s Jobs', 'Sales', 'Low Stock', 'Outstanding Payments'].map((label) => (
                  <div key={label} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <p className="text-xs text-white/60">{label}</p>
                    <p className="mt-2 text-xl font-semibold">
                      {label === 'Sales' ? '$4,250' : label === 'Low Stock' ? '12' : label === 'Today\'s Jobs' ? '24' : '8'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" data-reveal className="reveal mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:px-10">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Everything Your Service Center Needs</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {featureCards.map((card) => (
            <article
              key={card.title}
              className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.04)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)]"
            >
              <span className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[#ffe4dc] text-[#e4552d]">
                ●
              </span>
              <h3 className="text-base font-semibold">{card.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#555]">{card.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section
        id="solutions"
        data-reveal
        className="reveal mx-auto grid w-full max-w-[1240px] items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-2 lg:px-10"
      >
        <div
          className="h-[360px] rounded-3xl bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1625047509168-a7026f36de04?auto=format&fit=crop&w=1400&q=80')",
          }}
        />
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Stop Managing Your Workshop with Paper and Spreadsheets.
          </h2>
          <p className="mt-5 text-base leading-7 text-[#555]">
            Bring your daily operations into one connected system. From the moment a customer arrives to the
            final payment, everything stays organized.
          </p>
          <ul className="mt-6 space-y-3 text-sm text-[#2f2f2f]">
            <li>✓ Faster job management</li>
            <li>✓ Complete vehicle history</li>
            <li>✓ Better stock control</li>
            <li>✓ Clear financial records</li>
            <li>✓ Real-time business visibility</li>
          </ul>
          <button className="mt-8 rounded-xl bg-[#171717] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black">
            Explore Features
          </button>
        </div>
      </section>

      <section id="how-it-works" data-reveal className="reveal mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:px-10">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          From Customer Arrival to Payment - Made Simple
        </h2>
        <div className="relative mt-12 grid gap-5 md:grid-cols-4">
          <div className="absolute left-0 right-0 top-8 hidden h-px bg-black/10 md:block" />
          {workflowSteps.map((step) => (
            <article key={step.number} className="relative rounded-2xl border border-black/10 bg-white p-5">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#171717] text-sm font-semibold text-white">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#555]">{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section data-reveal className="reveal mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:px-10">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your Entire Service Center at a Glance</h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#555]">
            See jobs, sales, stock, payments and business activity from one powerful dashboard.
          </p>
        </div>
        <div className="relative mt-10 overflow-x-auto rounded-3xl border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(0,0,0,0.08)]">
          <div className="min-w-[780px] rounded-2xl border border-black/10 bg-[#101215] p-5 text-white">
            <div className="mb-4 h-2 w-24 rounded-full bg-white/20" />
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg bg-white/10 p-3">Today&apos;s Jobs</div>
              <div className="rounded-lg bg-white/10 p-3">Sales</div>
              <div className="rounded-lg bg-white/10 p-3">Low Stock</div>
              <div className="rounded-lg bg-white/10 p-3">Outstanding Payments</div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="col-span-2 h-40 rounded-lg bg-white/5" />
              <div className="h-40 rounded-lg bg-white/5" />
            </div>
          </div>
          <span className="absolute left-6 top-6 rounded-full bg-[#e4552d] px-3 py-1 text-xs font-semibold text-white">
            Today&apos;s Jobs
          </span>
          <span className="absolute right-6 top-6 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#171717] shadow">
            Sales
          </span>
        </div>
      </section>

      <section data-reveal className="reveal mx-auto grid w-full max-w-[1240px] items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-10">
        <div className="overflow-hidden rounded-3xl border border-black/10 bg-white p-4">
          <div className="h-[340px] rounded-2xl bg-[#111] p-4">
            <div className="grid grid-cols-2 gap-3 text-xs text-white/75">
              <div className="rounded-md bg-white/10 p-3">Vehicle: CAX-4351</div>
              <div className="rounded-md bg-white/10 p-3">Technician: Rafi</div>
              <div className="rounded-md bg-white/10 p-3">Complaint: Brake noise</div>
              <div className="rounded-md bg-white/10 p-3">Status: In Progress</div>
            </div>
            <div className="mt-3 h-44 rounded-lg bg-white/5" />
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#e4552d]">Job Card Management</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">From Service Request to Completed Job.</h2>
          <p className="mt-5 text-base leading-7 text-[#555]">
            Create job cards, record customer complaints, manage vehicle details, assign technicians, track parts
            and follow the job until completion.
          </p>
          <ul className="mt-6 grid grid-cols-1 gap-2 text-sm text-[#2f2f2f] sm:grid-cols-2">
            <li>✓ Customer details</li>
            <li>✓ Vehicle information</li>
            <li>✓ Problem description</li>
            <li>✓ Technician assignment</li>
            <li>✓ Parts and labour</li>
            <li>✓ Job status</li>
            <li>✓ Complete service history</li>
          </ul>
          <button className="mt-8 rounded-xl bg-[#171717] px-5 py-3 text-sm font-semibold text-white transition hover:bg-black">
            Explore Job Cards
          </button>
        </div>
      </section>

      <section data-reveal className="reveal bg-white py-16">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Know Every Vehicle&apos;s History.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[#555]">
            When a customer comes back, instantly see previous services, repairs, parts replaced and invoices.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="rounded-2xl border border-black/10 bg-[#f7f7f5] p-5">
              <p className="text-sm font-semibold">Vehicle Profile</p>
              <p className="mt-2 text-sm text-[#666]">Toyota Axio • DHAKA METRO 11-4571</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-[#777]">Parts used</p>
              <p className="mt-2 text-sm text-[#444]">Brake Pad, Engine Oil, Oil Filter</p>
            </div>
            <div className="space-y-4 rounded-2xl border border-black/10 bg-[#f7f7f5] p-5">
              {['Job Card Created', 'Service Completed', 'Invoice Paid'].map((entry, idx) => (
                <div key={entry} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span className="h-3 w-3 rounded-full bg-[#e4552d]" />
                    {idx < 2 && <span className="mt-1 block h-12 w-px bg-black/15" />}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{entry}</p>
                    <p className="text-sm text-[#666]">Previous job cards, parts used and invoice history</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section data-reveal className="reveal mx-auto grid w-full max-w-[1240px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-10">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Never Lose Track of Your Spare Parts.</h2>
          <p className="mt-4 text-base leading-7 text-[#555]">Know what you have, what you need and what you purchased.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <article className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold tracking-wide text-[#e4552d]">STOCK</p>
              <p className="mt-2 text-sm text-[#555]">Current stock levels</p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold tracking-wide text-[#e4552d]">PURCHASING</p>
              <p className="mt-2 text-sm text-[#555]">Manage suppliers and purchases</p>
            </article>
            <article className="rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold tracking-wide text-[#e4552d]">LOW STOCK</p>
              <p className="mt-2 text-sm text-[#555]">Know when items need reordering</p>
            </article>
          </div>
        </div>
        <div className="rounded-3xl border border-black/10 bg-white p-4">
          <div className="h-[320px] rounded-2xl bg-[#12161f] p-4">
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="h-9 rounded-md bg-white/10" />
              <div className="h-9 rounded-md bg-white/10" />
              <div className="h-9 rounded-md bg-white/10" />
            </div>
            <div className="h-[230px] rounded-lg bg-white/5" />
          </div>
        </div>
      </section>

      <section data-reveal className="reveal bg-[#16191f] py-16 text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Turn Completed Jobs Into Clear Business Records.</h2>
          <p className="mt-4 max-w-3xl text-base leading-7 text-white/75">
            Create invoices, receive payments and keep your financial records organized.
          </p>
          <div className="mt-8 grid gap-8 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/15 bg-white/5 p-5">
              <p className="text-sm">Job</p>
              <p className="text-lg">↓</p>
              <p className="text-sm">Invoice</p>
              <p className="text-lg">↓</p>
              <p className="text-sm">Payment</p>
              <p className="text-lg">↓</p>
              <p className="text-sm">Accounts</p>
            </div>
            <ul className="grid grid-cols-1 gap-2 text-sm text-white/85 sm:grid-cols-2">
              <li>✓ Professional invoices</li>
              <li>✓ Payment tracking</li>
              <li>✓ Customer balances</li>
              <li>✓ Supplier balances</li>
              <li>✓ Income and expenses</li>
              <li>✓ Financial reports</li>
            </ul>
          </div>
        </div>
      </section>

      <section data-reveal className="reveal mx-auto grid w-full max-w-[1240px] items-center gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-10">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">Manage Your Team Too.</h2>
          <p className="mt-4 text-base leading-7 text-[#555]">
            Keep employee records, attendance, roles and permissions organized from the same platform.
          </p>
        </div>
        <div className="rounded-3xl border border-black/10 bg-white p-4">
          <div className="h-[260px] rounded-2xl bg-[#0f1116] p-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="h-20 rounded-md bg-white/10" />
              <div className="h-20 rounded-md bg-white/10" />
              <div className="h-20 rounded-md bg-white/10" />
            </div>
            <div className="mt-3 h-28 rounded-md bg-white/5" />
          </div>
        </div>
      </section>

      <section
        data-reveal
        className="reveal relative overflow-hidden py-20 text-white"
        style={{
          backgroundImage:
            "linear-gradient(90deg, rgba(0,0,0,0.78), rgba(0,0,0,0.45)), url('https://images.unsplash.com/photo-1613214150388-8fbd58dd67bf?auto=format&fit=crop&w=1600&q=80')",
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      >
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10">
          <h2 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Know What&apos;s Happening in Your Business.</h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/85">
            Even when you&apos;re away from the workshop, you can see jobs, sales, stock, payments and business
            performance.
          </p>
          <button className="mt-8 rounded-xl bg-[#e4552d] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#ca4723]">
            See the Dashboard
          </button>
        </div>
      </section>

      <section data-reveal className="reveal mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:px-10">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Built for Service Businesses</h2>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {businessTypes.map((type) => (
            <article key={type.title} className="overflow-hidden rounded-2xl border border-black/10 bg-white">
              <div className="h-40 bg-cover bg-center" style={{ backgroundImage: `url('${type.image}')` }} />
              <div className="p-4">
                <h3 className="text-base font-semibold">{type.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[#555]">{type.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" data-reveal className="reveal bg-white py-16">
        <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8 lg:px-10">
          <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Simple Plans for Every Service Center</h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-2xl border p-6 ${
                  plan.highlighted
                    ? 'border-[#e4552d] bg-[#fff5f1] shadow-[0_20px_50px_rgba(228,85,45,0.16)]'
                    : 'border-black/10 bg-white'
                }`}
              >
                <p className="text-xs font-semibold tracking-[0.18em] text-[#666]">{plan.name}</p>
                <p className="mt-4 text-4xl font-bold">{plan.price}</p>
                <p className="mt-1 text-sm text-[#666]">monthly billing</p>
                <p className="mt-4 text-sm font-medium text-[#333]">{plan.note}</p>
                <ul className="mt-5 space-y-2 text-sm text-[#444]">
                  {plan.features.map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <button
                  className={`mt-6 w-full rounded-xl px-4 py-3 text-sm font-semibold transition ${
                    plan.highlighted
                      ? 'bg-[#e4552d] text-white hover:bg-[#ca4723]'
                      : 'border border-black/15 text-[#222] hover:bg-black/5'
                  }`}
                >
                  Start Free Trial
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" data-reveal className="reveal mx-auto w-full max-w-[980px] px-5 py-16 sm:px-8">
        <h2 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">Frequently Asked Questions</h2>
        <div className="mt-10 space-y-3">
          {faqs.map((question, index) => {
            const isOpen = openFaq === index;
            return (
              <article key={question} className="rounded-2xl border border-black/10 bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-4 text-left"
                  onClick={() => setOpenFaq((prev) => (prev === index ? null : index))}
                >
                  <span className="text-sm font-semibold text-[#222]">{question}</span>
                  <span className="text-lg text-[#888]">{isOpen ? '-' : '+'}</span>
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm leading-6 text-[#666]">
                    ServiceOS is cloud-based and built to simplify operations for modern service centers. Our team
                    can guide your setup based on your workflow.
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section id="cta" data-reveal className="reveal bg-[#e4552d] py-16 text-white">
        <div className="mx-auto w-full max-w-[1240px] px-5 text-center sm:px-8 lg:px-10">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-5xl">Ready to Run Your Service Center Better?</h2>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-white/90">
            Bring your jobs, customers, vehicles, stock, invoices and accounts together in one simple system.
          </p>
          <div className="mx-auto mt-8 grid max-w-md gap-3 sm:grid-cols-2">
            <button className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[#171717] transition hover:bg-white/90">
              Start Free Trial
            </button>
            <button className="rounded-xl border border-white/40 bg-transparent px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
              Book a Demo
            </button>
          </div>
          <p className="mt-4 text-sm text-white/90">Get started in minutes.</p>
        </div>
      </section>

      <footer className="bg-[#121417] py-14 text-white">
        <div className="mx-auto grid w-full max-w-[1240px] gap-10 px-5 sm:px-8 lg:grid-cols-5 lg:px-10">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#e4552d] text-sm font-bold text-white">
                SO
              </span>
              <span className="text-lg font-semibold">ServiceOS</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-6 text-white/70">
              Simple software for smarter service centers.
            </p>
            <p className="mt-6 text-xs text-white/50">© {new Date().getFullYear()} ServiceOS. All rights reserved.</p>
          </div>
          <div>
            <p className="text-sm font-semibold">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>Features</li>
              <li>Pricing</li>
              <li>Demo</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Solutions</p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>Automobile Service Centers</li>
              <li>Repair Workshops</li>
              <li>Motorcycle Workshops</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-white/70">
              <li>About</li>
              <li>Contact</li>
              <li>Support</li>
              <li>Privacy Policy</li>
              <li>Terms &amp; Conditions</li>
            </ul>
          </div>
        </div>
      </footer>

      {joinModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4 py-6">
          <div className="w-full max-w-2xl rounded-2xl border border-black/10 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between border-b border-black/10 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-[#171717]">Join ServiceOS</h3>
                <p className="mt-1 text-sm text-[#666]">Tell us about your business and admin account details.</p>
              </div>
              <button
                type="button"
                onClick={closeJoinModal}
                className="rounded-md border border-black/15 px-3 py-1.5 text-sm font-semibold text-[#444] hover:bg-black/5"
              >
                Close
              </button>
            </div>

            <form className="space-y-4 px-6 py-5" onSubmit={handleJoinSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="business_name">
                    Business Name
                  </label>
                  <input
                    id="business_name"
                    name="business_name"
                    value={joinForm.business_name}
                    onChange={handleJoinInputChange}
                    required
                    className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                    placeholder="ABC Service Center"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="country">
                    Country
                  </label>
                  <select
                    id="country"
                    name="country"
                    value={joinForm.country}
                    onChange={handleJoinInputChange}
                    required
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                  >
                    <option value="">Select a country</option>
                    {countryOptions.map((country) => (
                      <option key={country.code} value={country.name}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="currency">
                    Currency
                  </label>
                  <select
                    id="currency"
                    name="currency"
                    value={joinForm.currency}
                    onChange={handleJoinInputChange}
                    required
                    className="w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                  >
                    {currencyOptions.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="contact_number">
                    Contact Number
                  </label>
                  <input
                    id="contact_number"
                    name="contact_number"
                    value={joinForm.contact_number}
                    onChange={handleJoinInputChange}
                    required
                    className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                    placeholder="+8801XXXXXXXXX"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="business_address">
                  Business Address
                </label>
                <textarea
                  id="business_address"
                  name="business_address"
                  value={joinForm.business_address}
                  onChange={handleJoinInputChange}
                  rows={3}
                  required
                  className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                  placeholder="House, road, city, country"
                />
              </div>

              <div className="rounded-xl border border-[#e4552d]/20 bg-[#fff5f1] p-4">
                <p className="text-sm font-semibold text-[#a1371c]">Admin Login Details</p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="admin_name">
                      Admin Name
                    </label>
                    <input
                      id="admin_name"
                      name="admin_name"
                      value={joinForm.admin_name}
                      onChange={handleJoinInputChange}
                      required
                      className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                      placeholder="Owner / Manager"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="admin_email">
                      Admin Email
                    </label>
                    <input
                      id="admin_email"
                      name="admin_email"
                      type="email"
                      value={joinForm.admin_email}
                      onChange={handleJoinInputChange}
                      required
                      className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                      placeholder="admin@business.com"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="admin_password">
                      Password
                    </label>
                    <input
                      id="admin_password"
                      name="admin_password"
                      type="password"
                      value={joinForm.admin_password}
                      onChange={handleJoinInputChange}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[#333]" htmlFor="admin_password_confirmation">
                      Confirm Password
                    </label>
                    <input
                      id="admin_password_confirmation"
                      name="admin_password_confirmation"
                      type="password"
                      value={joinForm.admin_password_confirmation}
                      onChange={handleJoinInputChange}
                      required
                      minLength={8}
                      className="w-full rounded-xl border border-black/15 px-3 py-2.5 text-sm outline-none transition focus:border-[#e4552d]"
                      placeholder="Repeat password"
                    />
                  </div>
                </div>
              </div>

              {joinErrorMessage && <p className="text-sm font-medium text-red-600">{joinErrorMessage}</p>}
              {joinSuccessMessage && <p className="text-sm font-medium text-emerald-600">{joinSuccessMessage}</p>}

              <div className="flex flex-col gap-3 border-t border-black/10 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeJoinModal}
                  className="rounded-xl border border-black/15 px-5 py-2.5 text-sm font-semibold text-[#333] hover:bg-black/5"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={joinSubmitting}
                  className="rounded-xl bg-[#e4552d] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#ca4723] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {joinSubmitting ? 'Submitting...' : 'Submit Registration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style jsx>{`
        .animate-rise {
          animation: riseIn 0.7s ease-out both;
        }

        .animate-rise-delayed {
          animation: riseIn 0.95s ease-out both;
        }

        .reveal {
          opacity: 0;
          transform: translateY(22px);
          transition: opacity 0.65s ease, transform 0.65s ease;
        }

        .reveal.is-visible {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes riseIn {
          0% {
            opacity: 0;
            transform: translateY(22px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
