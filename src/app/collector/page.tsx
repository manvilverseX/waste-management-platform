import React from 'react';
import { CollectorDashboard } from '@/features/collector/components/CollectorDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Collector Dashboard - Waste Management Platform',
  description: 'View waste collection requests, claim community requests, and submit collected evidence.',
};

export default function CollectorPage() {
  return <CollectorDashboard />;
}
