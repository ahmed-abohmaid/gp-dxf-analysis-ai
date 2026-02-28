export function buildRagQueries(): {
  classificationQueries: [string, string];
  valueQueries: [string, string, string, string, string];
} {
  return {
    classificationQueries: [
      "DPS-01 customer category classification facility type C1 C2 C3 residential commercial dwelling shop office hospital school mosque common area building services Table 2",
      "DPS-01 mixed use building common area corridor staircase lobby C11 classification multiple categories special facilities",
    ],

    valueQueries: [
      "DPS-01 load density VA per square meter combined loads lighting air conditioning power sockets Table 7 Table 8 customer category",
      "DPS-01 demand factor Table 11 customer category C1 C2 C3 maximum demand after diversity percentage",
      "DPS-01 residential dwelling C1 area square meter kVA load estimation Table 3 Table 4 230V 400V single phase three phase",
      "DPS-01 commercial shop C2 area square meter kVA load estimation Table 5 Table 6 400V three phase",
      "DPS-01 common area building services C11 load density corridor lobby staircase emergency lighting VA per square meter shared area",
    ],
  };
}
