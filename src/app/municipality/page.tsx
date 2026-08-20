import React from 'react';
import { MunicipalityDashboard } from '@/features/municipality/components/MunicipalityDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Municipality Dashboard - Waste Management Platform',
  description: 'Review and manually verify or reject garbage collection requests.',
};

export default function MunicipalityPage() {
  return <MunicipalityDashboard />;
}
