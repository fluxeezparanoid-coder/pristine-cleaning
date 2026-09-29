# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY src/Pristine.Api/Pristine.Api.csproj src/Pristine.Api/
RUN dotnet restore src/Pristine.Api/Pristine.Api.csproj
COPY src/ src/
RUN dotnet publish src/Pristine.Api/Pristine.Api.csproj -c Release -o /app --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .
# Run as the image's built-in unprivileged user, never as root.
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Pristine.Api.dll"]
