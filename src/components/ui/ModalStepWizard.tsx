import React from 'react';
import { Check } from 'lucide-react';

export interface WizardStepItem {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export interface ModalStepWizardProps {
  steps: WizardStepItem[];
  activeStep: number;
  onStepClick?: (stepIndex: number) => void;
  allowStepClick?: boolean;
}

export const ModalStepWizard: React.FC<ModalStepWizardProps> = ({
  steps,
  activeStep,
  onStepClick,
  allowStepClick = true,
}) => {
  return (
    <div className="wizard-stepper" role="tablist" aria-label="Form Steps">
      {steps.map((step, index) => {
        const isActive = activeStep === index;
        const isCompleted = activeStep > index;
        const canClick = allowStepClick && onStepClick && (isCompleted || isActive);

        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={`Step ${index + 1}: ${step.label}`}
              className={`wizard-step ${isActive ? 'wizard-step-active' : ''} ${
                isCompleted ? 'wizard-step-completed' : ''
              }`}
              disabled={!canClick && !isActive}
              onClick={() => {
                if (canClick && onStepClick) {
                  onStepClick(index);
                }
              }}
            >
              <div className="wizard-step-circle">
                {isCompleted ? <Check size={14} strokeWidth={3} /> : index + 1}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                <span className="wizard-step-label">{step.label}</span>
                {step.description && (
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.1 }}>
                    {step.description}
                  </span>
                )}
              </div>
            </button>

            {index < steps.length - 1 && (
              <div
                className={`wizard-step-divider ${
                  activeStep > index ? 'wizard-step-divider-completed' : ''
                }`}
                aria-hidden="true"
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
