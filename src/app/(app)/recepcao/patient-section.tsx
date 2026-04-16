import React from "react";

type PatientSectionProps = {
  patientName: string;
  patientRegistrationNumber: string;
  onPatientNameChange: (name: string) => void;
  onRegistrationNumberChange: (number: string) => void;
};

export function PatientSection({
  patientName,
  patientRegistrationNumber,
  onPatientNameChange,
  onRegistrationNumberChange,
}: PatientSectionProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <label className="block col-span-2">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Nome do paciente
        </span>
        <input
          type="text"
          required
          minLength={2}
          value={patientName}
          onChange={(event) => onPatientNameChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          placeholder="Ex.: Maria Aparecida"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-700">
          Nº do cadastro
        </span>
        <input
          type="text"
          required
          value={patientRegistrationNumber}
          onChange={(event) => onRegistrationNumberChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100"
          placeholder="Obrigatório. Ex.: 548921"
        />
      </label>
    </div>
  );
}
