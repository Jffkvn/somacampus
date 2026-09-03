import manifest from './manifest.json';
import framework from './framework.json';
import stages from './stages.json';

import mathSubject from './subjects/mathematics/subject.json';
import mathStrands from './subjects/mathematics/strands.json';
import mathObjectives from './subjects/mathematics/objectives.json';

import engSubject from './subjects/english/subject.json';
import engStrands from './subjects/english/strands.json';
import engObjectives from './subjects/english/objectives.json';

import sciSubject from './subjects/science/subject.json';
import sciStrands from './subjects/science/strands.json';
import sciObjectives from './subjects/science/objectives.json';

import gpSubject from './subjects/global_perspectives/subject.json';
import gpStrands from './subjects/global_perspectives/strands.json';
import gpObjectives from './subjects/global_perspectives/objectives.json';

import compSubject from './subjects/computing/subject.json';
import compStrands from './subjects/computing/strands.json';
import compObjectives from './subjects/computing/objectives.json';

import prerequisites from './relationships/prerequisites.json';

export interface PackSubStrandDef {
  code: string;
  name: string;
  display_order: number;
}

export interface PackStrandDef {
  code: string;
  name: string;
  description: string;
  display_order: number;
  sub_strands?: PackSubStrandDef[];
}

export interface PackObjectiveDef {
  code: string;
  stage_number: number;
  strand_code: string;
  sub_strand_code?: string | null;
  title: string;
  description: string;
  progression_order: number;
}

export interface PackSubjectDef {
  subject: {
    code: string;
    name: string;
    cambridge_code: string;
    description: string;
    display_order: number;
  };
  strands: PackStrandDef[];
  objectives: PackObjectiveDef[];
}

export interface CurriculumPack {
  manifest: typeof manifest;
  framework: typeof framework;
  stages: typeof stages;
  subjects: Record<string, PackSubjectDef>;
  prerequisites: typeof prerequisites;
}

export const CAMBRIDGE_PRIMARY_PACK: CurriculumPack = {
  manifest,
  framework,
  stages,
  subjects: {
    mathematics: {
      subject: mathSubject,
      strands: mathStrands,
      objectives: mathObjectives,
    },
    english: {
      subject: engSubject,
      strands: engStrands,
      objectives: engObjectives,
    },
    science: {
      subject: sciSubject,
      strands: sciStrands,
      objectives: sciObjectives,
    },
    global_perspectives: {
      subject: gpSubject,
      strands: gpStrands,
      objectives: gpObjectives,
    },
    computing: {
      subject: compSubject,
      strands: compStrands,
      objectives: compObjectives,
    },
  },
  prerequisites,
};
