import React from 'react';
import { CollectionStatus, VerificationStatus } from '@/types';
import { CheckCircle2, Clock, XCircle, AlertTriangle, Truck, Package } from 'lucide-react';

interface Props {
  status: CollectionStatus | VerificationStatus;
  type?: 'collection' | 'verification';
}

export const VerificationStatusBadge: React.FC<Props> = ({ status, type = 'collection' }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'VERIFIED':
      case 'verified':
        return {
          bg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
          icon: <CheckCircle2 className="w-3.5 h-3.5 mr-1" />,
          label: 'Verified'
        };
      case 'COLLECTED':
        return {
          bg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
          icon: <Package className="w-3.5 h-3.5 mr-1" />,
          label: 'Collected'
        };
      case 'ASSIGNED':
        return {
          bg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
          icon: <Truck className="w-3.5 h-3.5 mr-1" />,
          label: 'Assigned'
        };
      case 'PENDING':
      case 'pending':
        return {
          bg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
          icon: <Clock className="w-3.5 h-3.5 mr-1" />,
          label: 'Pending'
        };
      case 'REJECTED':
      case 'rejected':
        return {
          bg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
          icon: <XCircle className="w-3.5 h-3.5 mr-1" />,
          label: 'Rejected'
        };
      case 'CANCELLED':
        return {
          bg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
          icon: <AlertTriangle className="w-3.5 h-3.5 mr-1" />,
          label: 'Cancelled'
        };
      default:
        return {
          bg: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
          icon: null,
          label: status
        };
    }
  };

  const { bg, icon, label } = getBadgeStyle();

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${bg}`}>
      {icon}
      {label}
    </span>
  );
};
