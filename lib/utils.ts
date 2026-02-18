type ClassValue = string | undefined | null | false | ClassValue[];

function flattenClassValues(values: ClassValue[]): string[] {
  const result: string[] = [];

  values.forEach((value) => {
    if (!value) {
      return;
    }

    if (Array.isArray(value)) {
      result.push(...flattenClassValues(value));
      return;
    }

    result.push(value);
  });

  return result;
}

export function cn(...inputs: ClassValue[]): string {
  return flattenClassValues(inputs).join(" ");
}
