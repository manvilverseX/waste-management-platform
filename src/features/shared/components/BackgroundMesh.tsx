'use client';

import React from 'react';

interface BackgroundMeshProps {
  role: 'resident' | 'collector' | 'municipality' | 'auth';
}

export const BackgroundMesh: React.FC<BackgroundMeshProps> = ({ role }) => {
  if (role === 'auth') {
    return (
      <div className="sc-mesh-bg" aria-hidden="true">
        <div className="sc-mesh-blob-forest w-[50vw] h-[50vw] top-[-10vw] left-[-10vw] opacity-75" />
        <div className="sc-mesh-blob-marigold w-[40vw] h-[40vw] bottom-[-5vw] right-[-5vw] opacity-60" />
      </div>
    );
  }

  if (role === 'resident') {
    return (
      <div className="sc-mesh-bg" aria-hidden="true">
        <div className="sc-mesh-blob-forest w-[45vw] h-[45vw] top-[-5vw] left-[15vw]" />
        <div className="sc-mesh-blob-marigold w-[35vw] h-[35vw] bottom-[10vw] right-[5vw]" />
      </div>
    );
  }

  if (role === 'collector') {
    return (
      <div className="sc-mesh-bg" aria-hidden="true">
        <div className="sc-mesh-blob-terra w-[45vw] h-[45vw] top-[5vw] right-[10vw]" />
        <div className="sc-mesh-blob-marigold w-[35vw] h-[35vw] bottom-[-5vw] left-[5vw]" />
      </div>
    );
  }

  return (
    <div className="sc-mesh-bg" aria-hidden="true">
      <div className="sc-mesh-blob-indigo w-[50vw] h-[50vw] top-[-10vw] left-[5vw]" />
      <div className="sc-mesh-blob-forest w-[35vw] h-[35vw] bottom-[5vw] right-[15vw]" />
    </div>
  );
};
