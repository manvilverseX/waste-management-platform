import React from 'react';
import { ResidentDashboard } from '@/features/resident/components/ResidentDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Resident Dashboard - Waste Management Platform',
  description: 'Manage waste collection requests, view community scores, and track reward points.',
};

export default function ResidentPage() {
  return <ResidentDashboard />;
}
