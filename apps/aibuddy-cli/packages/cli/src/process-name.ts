export const CLI_COMMAND_NAME = "aibuddy";
export const CLI_PROCESS_NAME = "aibuddy-cli";

interface ProcessTitleTarget {
  title: string;
}

export const setCliProcessTitle = (
  target: ProcessTitleTarget = process,
): void => {
  target.title = CLI_PROCESS_NAME;
};
