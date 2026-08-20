import React from 'react';
import { CommunityDashboard } from '@/features/community/components/CommunityDashboard';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Community Dashboard - EcoClean Hub',
  description: 'Track community waste management scorecard, member statistics, and environmental impact metrics.',
};

export default function CommunityPage() {
  return <CommunityDashboard />;
}
